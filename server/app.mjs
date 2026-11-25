import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  SUGARTAXAE_TOOL_VERSION,
  SUGAR_CONTROLS,
  SUGAR_PRESETS,
  LEGAL_DISCLAIMER_AR,
  LEGAL_DISCLAIMER_EN,
  assessSugarTaxReadiness,
  auditSkuCsv,
  buildSugarBriefMarkdown,
  evaluatePenaltyAndExposure,
  evaluateTierAndRates,
  exportSkuAuditCsv,
  sanitizeCsvCell,
} from '../src/core/index.ts';
import {
  allocateDossierCodeTx,
  closeDb,
  createDb,
  generatePublicSlug,
  getDbStats,
  withImmediateTransaction,
} from './db.mjs';

const DEFAULT_MAX_BODY_BYTES = 512 * 1024;
const DEFAULT_RATE_LIMIT_MAX = 300;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

const VALID_CATEGORIES = new Set([
  'sweetened_beverage',
  'energy_drink',
  'milk_dairy_75plus',
  'natural_juice_100pct',
]);
const VALID_FORMATS = new Set([
  'ready_to_drink',
  'liquid_concentrate',
  'powder_sachet',
  'gel_extract',
]);
const VALID_CONTROL_IDS = new Set(SUGAR_CONTROLS.map((c) => c.id));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function normalizeBasePath(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim();
  if (!cleaned || cleaned === '/') return '';
  if (!cleaned.startsWith('/')) cleaned = `/${cleaned}`;
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
}

function stripBasePath(pathname, basePath) {
  if (!basePath) return pathname || '/';
  if (pathname === basePath) return '/';
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || '/';
  }
  return pathname || '/';
}

function getSecurityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...extra,
  };
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...getSecurityHeaders(extraHeaders),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, status, contentType, body, extraHeaders = {}, method = 'GET') {
  res.writeHead(status, {
    ...getSecurityHeaders(extraHeaders),
    'Content-Type': contentType,
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

function injectBaseTagHtml(html, basePath) {
  let updated = html;
  if (basePath) {
    updated = updated.replace(/(href|src)="\/(?!\/)/g, `$1="${basePath}/`);
    updated = updated.replace(/(href|src)="\.\//g, `$1="${basePath}/`);
  }
  const safeBase = JSON.stringify(basePath).replace(/</g, '\\u003c');
  const snippet = `<script>window.__SUGARTAXAE_BASE__=${safeBase};</script>`;
  if (updated.includes('</head>')) {
    return updated.replace('</head>', `${snippet}\n</head>`);
  }
  if (updated.includes('<body')) {
    return updated.replace('<body', `${snippet}\n<body`);
  }
  return `${snippet}\n${updated}`;
}

function buildFallbackShellHtml(basePath) {
  const apiPrefix = `${basePath}/api`;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SugarTaxAE v${SUGARTAXAE_TOOL_VERSION} — مدقق ضريبة المشروبات المحلاة المتدرجة الإماراتية</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:2.5rem auto;padding:0 1.25rem;line-height:1.6;background:#0a1612;color:#eafaf3">
  <h1>SugarTaxAE v${SUGARTAXAE_TOOL_VERSION}</h1>
  <p>UAE Tiered Volumetric Sweetened Beverages Excise Tax (Cabinet Decision 197/2025, FTA 10/2025 &amp; MoIAT Lab) Studio.</p>
  <p><strong>HTTP/SQLite WAL Backend Active</strong> — Base Path: <code>${basePath || '/'}</code> | API Root: <code>${apiPrefix}</code></p>
  <p style="font-size:.9rem;color:#9fc5b6">${LEGAL_DISCLAIMER_AR}</p>
</body>
</html>`;
}

async function readJsonBody(req, maxBodyBytes) {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    req.resume();
    throw new HttpError(
      413,
      'PAYLOAD_TOO_LARGE',
      `Request body exceeds limit of ${maxBodyBytes} bytes.`,
    );
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBodyBytes) {
        settled = true;
        req.resume();
        reject(
          new HttpError(
            413,
            'PAYLOAD_TOO_LARGE',
            `Request body exceeds limit of ${maxBodyBytes} bytes.`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new HttpError(400, 'INVALID_JSON', 'JSON body must be an object.'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new HttpError(400, 'INVALID_JSON', 'Malformed JSON request body.'));
      }
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function validateNumberField(value, min, max, fieldName) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be a number between ${min} and ${max}.`,
    );
  }
  return num;
}

function validateIsoDate(value, fieldName) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid YYYY-MM-DD date.`);
  }
  return value.trim();
}

function validateEnumField(value, validSet, fieldName) {
  if (!validSet.has(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Unsupported ${fieldName}: ${value}`);
  }
  return value;
}

function validateBoolField(value, fallback, fieldName) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a boolean.`);
  }
  return value;
}

function normalizeControlArray(val, fallback) {
  if (val === undefined) return [...fallback];
  if (!Array.isArray(val)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'implementedControls must be an array.');
  }
  const seen = new Set();
  const out = [];
  for (const item of val) {
    const id = String(item).trim();
    if (!id) continue;
    if (!VALID_CONTROL_IDS.has(id)) {
      throw new HttpError(400, 'VALIDATION_ERROR', `Unsupported control ID: ${id}`);
    }
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function resolveAssessmentInput(body, baseInput = null) {
  let presetBase = baseInput;
  if (body.presetId !== undefined) {
    const found = SUGAR_PRESETS.find((p) => p.id === String(body.presetId));
    if (!found) {
      throw new HttpError(404, 'PRESET_NOT_FOUND', `Unknown presetId: ${body.presetId}`);
    }
    presetBase = found.input;
  }

  const defaults = presetBase || SUGAR_PRESETS[0].input;
  const rawInput =
    body.input && typeof body.input === 'object' && !Array.isArray(body.input)
      ? { ...body, ...body.input }
      : body;

  const organizationName =
    rawInput.organizationName !== undefined
      ? String(rawInput.organizationName).trim()
      : defaults.organizationName;
  if (!organizationName) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'organizationName is required.');
  }

  const trnNumber =
    rawInput.trnNumber !== undefined
      ? String(rawInput.trnNumber).trim()
      : defaults.trnNumber;
  if (!trnNumber) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'trnNumber is required.');
  }

  const taxPeriodEndDate = validateIsoDate(
    rawInput.taxPeriodEndDate !== undefined
      ? String(rawInput.taxPeriodEndDate)
      : defaults.taxPeriodEndDate,
    'taxPeriodEndDate',
  );

  const productName =
    rawInput.productName !== undefined
      ? String(rawInput.productName).trim()
      : defaults.productName;
  if (!productName) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'productName is required.');
  }

  const beverageCategory = validateEnumField(
    rawInput.beverageCategory !== undefined
      ? String(rawInput.beverageCategory).trim()
      : defaults.beverageCategory,
    VALID_CATEGORIES,
    'beverageCategory',
  );

  const productFormat = validateEnumField(
    rawInput.productFormat !== undefined
      ? String(rawInput.productFormat).trim()
      : defaults.productFormat,
    VALID_FORMATS,
    'productFormat',
  );

  return {
    organizationName,
    trnNumber,
    taxPeriodEndDate,
    productName,
    beverageCategory,
    productFormat,
    sugarGramsPer100mlReady: validateNumberField(
      rawInput.sugarGramsPer100mlReady ?? defaults.sugarGramsPer100mlReady,
      0,
      500,
      'sugarGramsPer100mlReady',
    ),
    containsAddedSugarOrSweetener: validateBoolField(
      rawInput.containsAddedSugarOrSweetener,
      defaults.containsAddedSugarOrSweetener,
      'containsAddedSugarOrSweetener',
    ),
    artificialSweetenersOnly: validateBoolField(
      rawInput.artificialSweetenersOnly,
      defaults.artificialSweetenersOnly,
      'artificialSweetenersOnly',
    ),
    dairyPercentage: validateNumberField(
      rawInput.dairyPercentage ?? defaults.dairyPercentage,
      0,
      100,
      'dairyPercentage',
    ),
    baseUnitsOrLitres: validateNumberField(
      rawInput.baseUnitsOrLitres ?? defaults.baseUnitsOrLitres,
      0,
      1_000_000_000,
      'baseUnitsOrLitres',
    ),
    reconstitutionRatioLitresPerUnit: validateNumberField(
      rawInput.reconstitutionRatioLitresPerUnit ?? defaults.reconstitutionRatioLitresPerUnit,
      0.01,
      10_000,
      'reconstitutionRatioLitresPerUnit',
    ),
    retailOrExcisePricePerLitreAed: validateNumberField(
      rawInput.retailOrExcisePricePerLitreAed ?? defaults.retailOrExcisePricePerLitreAed,
      0,
      100_000,
      'retailOrExcisePricePerLitreAed',
    ),
    hasMoIatAccreditedLabReport: validateBoolField(
      rawInput.hasMoIatAccreditedLabReport,
      defaults.hasMoIatAccreditedLabReport,
      'hasMoIatAccreditedLabReport',
    ),
    hasMoIatConformityCert: validateBoolField(
      rawInput.hasMoIatConformityCert,
      defaults.hasMoIatConformityCert,
      'hasMoIatConformityCert',
    ),
    dilutionGuidelinesVerified: validateBoolField(
      rawInput.dilutionGuidelinesVerified,
      defaults.dilutionGuidelinesVerified,
      'dilutionGuidelinesVerified',
    ),
    registeredOnEmaraTax: validateBoolField(
      rawInput.registeredOnEmaraTax,
      defaults.registeredOnEmaraTax,
      'registeredOnEmaraTax',
    ),
    lateMonthsUnderAudit: validateNumberField(
      rawInput.lateMonthsUnderAudit ?? defaults.lateMonthsUnderAudit,
      0,
      120,
      'lateMonthsUnderAudit',
    ),
    repeatDocViolationWithin24m: validateBoolField(
      rawInput.repeatDocViolationWithin24m,
      defaults.repeatDocViolationWithin24m,
      'repeatDocViolationWithin24m',
    ),
    targetReformulatedSugarPer100ml: validateNumberField(
      rawInput.targetReformulatedSugarPer100ml ?? defaults.targetReformulatedSugarPer100ml,
      0,
      500,
      'targetReformulatedSugarPer100ml',
    ),
    skuCsv:
      rawInput.skuCsv !== undefined ? String(rawInput.skuCsv) : defaults.skuCsv || '',
    implementedControls: normalizeControlArray(
      rawInput.implementedControls,
      defaults.implementedControls,
    ),
    notes: rawInput.notes !== undefined ? String(rawInput.notes) : defaults.notes || '',
  };
}

function mapProfileRow(row) {
  return {
    id: row.id,
    organizationName: row.organization_name,
    trnNumber: row.trn_number,
    beverageCategory: row.beverage_category,
    productFormat: row.product_format,
    taxPeriodEndDate: row.tax_period_end_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAssessmentRow(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    dossierCode: row.dossier_code,
    title: row.title,
    organizationName: row.organization_name,
    trnNumber: row.trn_number,
    taxPeriodEndDate: row.tax_period_end_date,
    beverageCategory: row.beverage_category,
    productFormat: row.product_format,
    status: row.status,
    readinessScore: row.readiness_score,
    appliedRateAedPerL: row.applied_rate_aed_per_l,
    volumetricExciseAed: row.volumetric_excise_aed,
    totalExposureAed: row.total_exposure_aed,
    activeGapCount: row.active_gap_count,
    input: JSON.parse(row.input_json),
    result: JSON.parse(row.result_json),
    canonicalText: row.canonical_text,
    dossierSha256: row.dossier_sha256,
    publicSlug: row.public_slug,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findAssessmentRow(db, idOrCode) {
  const key = decodeURIComponent(String(idOrCode || '')).trim();
  if (/^\d+$/.test(key)) {
    return db.prepare('SELECT * FROM assessments WHERE id = ?').get(Number(key));
  }
  return db.prepare('SELECT * FROM assessments WHERE dossier_code = ?').get(key);
}

function insertAssessmentRecord(db, { profileId = null, title, input, result }) {
  return withImmediateTransaction(db, () => {
    const yearMatch = /^(\d{4})-/.exec(input.taxPeriodEndDate);
    const year = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear();
    const dossierCode = allocateDossierCodeTx(db, year >= 2024 ? year : new Date().getUTCFullYear());
    const now = new Date().toISOString();
    const finalTitle =
      (title && title.trim()) || `${input.organizationName} — ${input.productName}`;

    return db
      .prepare(
        `INSERT INTO assessments (
           profile_id, dossier_code, title, organization_name, trn_number,
           tax_period_end_date, beverage_category, product_format, status, readiness_score,
           applied_rate_aed_per_l, volumetric_excise_aed, total_exposure_aed, active_gap_count,
           input_json, result_json, canonical_text, dossier_sha256,
           public_slug, locked_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
         RETURNING *`,
      )
      .get(
        profileId,
        dossierCode,
        finalTitle,
        input.organizationName,
        input.trnNumber,
        input.taxPeriodEndDate,
        input.beverageCategory,
        input.productFormat,
        result.status,
        result.readinessScore,
        result.tierEval.appliedRateAedPerL,
        result.tierEval.volumetricExcise2026Aed,
        result.exposure.totalFinancialExposureAed,
        result.activeGapCount,
        JSON.stringify(input),
        JSON.stringify(result),
        result.canonicalDossierText,
        result.dossierSha256,
        now,
        now,
      );
  });
}

function formatSummaryCsvCell(val) {
  const safe = sanitizeCsvCell(val);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function buildFallbackSummaryCsv(item) {
  const header = [
    'dossier_code',
    'organization_name',
    'trn_number',
    'product_name',
    'tax_period_end',
    'ex201_due_date',
    'beverage_category',
    'product_format',
    'sugar_g_per_100ml',
    'reconstituted_litres',
    'applied_tier',
    'applied_rate_aed_per_l',
    'volumetric_excise_2026_aed',
    'total_exposure_aed',
    'status',
    'readiness_score',
    'dossier_sha256',
  ].join(',');

  const row = [
    formatSummaryCsvCell(item.dossierCode),
    formatSummaryCsvCell(item.organizationName),
    formatSummaryCsvCell(item.trnNumber),
    formatSummaryCsvCell(item.input.productName),
    formatSummaryCsvCell(item.taxPeriodEndDate),
    formatSummaryCsvCell(item.result.tierEval.emaraTaxReturnDueDate),
    formatSummaryCsvCell(item.beverageCategory),
    formatSummaryCsvCell(item.productFormat),
    item.input.sugarGramsPer100mlReady,
    item.result.tierEval.reconstitutedLitres,
    formatSummaryCsvCell(item.result.tierEval.appliedTier),
    item.appliedRateAedPerL,
    item.volumetricExciseAed,
    item.totalExposureAed,
    formatSummaryCsvCell(item.status),
    item.readinessScore,
    formatSummaryCsvCell(item.dossierSha256),
  ].join(',');

  return `\uFEFF${header}\r\n${row}\r\n`;
}

export function createApp(options = {}) {
  const db = createDb({ dbPath: options.dbPath, dataDir: options.dataDir });
  const basePath = normalizeBasePath(
    options.basePath !== undefined ? options.basePath : process.env.BASE_PATH || '',
  );
  const staticDir = path.resolve(
    options.staticDir || path.resolve(import.meta.dirname, '..', 'dist'),
  );
  const maxBodyBytes = Number(options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
  const rateLimitMax = Number(options.rateLimitMax ?? DEFAULT_RATE_LIMIT_MAX);
  const rateLimitWindowMs = Number(options.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS);
  const rateCounters = new Map();
  const startedAtMs = Date.now();

  function checkRateLimit(req) {
    const ip =
      String(req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    const now = Date.now();
    const entry = rateCounters.get(ip);
    if (!entry || now >= entry.resetAt) {
      rateCounters.set(ip, { count: 1, resetAt: now + rateLimitWindowMs });
      return;
    }
    entry.count += 1;
    if (entry.count > rateLimitMax) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      throw new HttpError(
        429,
        'RATE_LIMIT_EXCEEDED',
        'Too many API requests; retry shortly.',
        { retryAfterSec },
      );
    }
  }

  function tryServeStatic(res, routePath, method) {
    const rel = routePath === '/' ? 'index.html' : routePath.replace(/^\/+/, '');
    const cleanRel = path.posix.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
    const indexPath = path.join(staticDir, 'index.html');

    if (fs.existsSync(staticDir)) {
      const candidate = path.resolve(staticDir, cleanRel);
      if (
        candidate.startsWith(`${staticDir}${path.sep}`) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        const ext = path.extname(candidate).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        if (ext === '.html') {
          const html = injectBaseTagHtml(fs.readFileSync(candidate, 'utf8'), basePath);
          sendText(res, 200, mime, html, { 'Cache-Control': 'no-cache' }, method);
          return true;
        }
        const buf = fs.readFileSync(candidate);
        res.writeHead(200, {
          ...getSecurityHeaders(),
          'Content-Type': mime,
          'Content-Length': buf.byteLength,
          'Cache-Control': cleanRel.startsWith('assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=300',
        });
        if (method === 'HEAD') {
          res.end();
          return true;
        }
        res.end(buf);
        return true;
      }
    }

    if (fs.existsSync(indexPath)) {
      const html = injectBaseTagHtml(fs.readFileSync(indexPath, 'utf8'), basePath);
      sendText(res, 200, 'text/html; charset=utf-8', html, { 'Cache-Control': 'no-cache' }, method);
      return true;
    }

    const fallbackHtml = injectBaseTagHtml(buildFallbackShellHtml(basePath), basePath);
    sendText(
      res,
      200,
      'text/html; charset=utf-8',
      fallbackHtml,
      { 'Cache-Control': 'no-cache' },
      method,
    );
    return true;
  }

  async function handleRequest(req, res) {
    const method = (req.method || 'GET').toUpperCase();
    const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
    const routePath = stripBasePath(urlObj.pathname, basePath);

    if (method === 'GET' && (routePath === '/health' || routePath === '/api/health')) {
      return sendJson(res, 200, {
        ok: true,
        service: 'sugartaxae',
        version: SUGARTAXAE_TOOL_VERSION,
        basePath,
        uptimeSec: Math.round((Date.now() - startedAtMs) / 1000),
        db: getDbStats(db),
      });
    }

    if (method === 'GET' && (routePath === '/readyz' || routePath === '/api/readyz')) {
      try {
        const check = db.prepare('SELECT 1 AS ready').get();
        const stats = getDbStats(db);
        if (Number(check?.ready) !== 1) {
          throw new Error('SQLite readiness probe failed.');
        }
        return sendJson(res, 200, {
          ok: true,
          ready: true,
          service: 'sugartaxae',
          version: SUGARTAXAE_TOOL_VERSION,
          journalMode: stats.journalMode,
        });
      } catch (err) {
        return sendJson(res, 503, {
          ok: false,
          ready: false,
          error: 'DB_UNAVAILABLE',
          message: err instanceof Error ? err.message : 'Database unavailable',
        });
      }
    }

    if (routePath.startsWith('/api/')) {
      checkRateLimit(req);
    }

    if (method === 'GET' && routePath === '/api/presets') {
      return sendJson(res, 200, {
        ok: true,
        toolName: 'SugarTaxAE',
        version: SUGARTAXAE_TOOL_VERSION,
        legalDisclaimerEn: LEGAL_DISCLAIMER_EN,
        legalDisclaimerAr: LEGAL_DISCLAIMER_AR,
        controls: SUGAR_CONTROLS,
        presets: SUGAR_PRESETS,
      });
    }

    if (method === 'POST' && routePath === '/api/evaluate-tier') {
      const body = await readJsonBody(req, maxBodyBytes);
      const input = resolveAssessmentInput(body);
      const { tierEval, findings } = evaluateTierAndRates(input);
      return sendJson(res, 200, {
        ok: true,
        legalDisclaimerEn: LEGAL_DISCLAIMER_EN,
        legalDisclaimerAr: LEGAL_DISCLAIMER_AR,
        tierEval,
        findings,
      });
    }

    if (method === 'POST' && routePath === '/api/exposure') {
      const body = await readJsonBody(req, maxBodyBytes);
      const input = resolveAssessmentInput(body);
      const { tierEval } = evaluateTierAndRates(input);
      const { exposure, findings } = evaluatePenaltyAndExposure(input, tierEval);
      return sendJson(res, 200, {
        ok: true,
        legalDisclaimerEn: LEGAL_DISCLAIMER_EN,
        legalDisclaimerAr: LEGAL_DISCLAIMER_AR,
        tierEval,
        exposure,
        findings,
      });
    }

    if (method === 'POST' && routePath === '/api/audit-csv') {
      const body = await readJsonBody(req, maxBodyBytes);
      const csvText = String(body.csv ?? body.skuCsv ?? '');
      const audit = auditSkuCsv(csvText);
      const exportedCsv = audit.totalRows > 0 ? exportSkuAuditCsv(audit) : '';
      return sendJson(res, 200, {
        ok: true,
        audit,
        exportedCsv,
      });
    }

    if (method === 'POST' && routePath === '/api/export/sku-csv') {
      const body = await readJsonBody(req, maxBodyBytes);
      let csvText = String(body.csv ?? body.skuCsv ?? '');
      if (!csvText.trim() && body.presetId !== undefined) {
        const found = SUGAR_PRESETS.find((p) => p.id === String(body.presetId));
        if (!found) {
          throw new HttpError(404, 'PRESET_NOT_FOUND', `Unknown presetId: ${body.presetId}`);
        }
        csvText = found.input.skuCsv || '';
      }
      const audit = auditSkuCsv(csvText);
      if (audit.parseErrors.length > 0 && audit.rows.length === 0) {
        throw new HttpError(400, 'CSV_PARSE_ERROR', audit.parseErrors.join(' '));
      }
      const exportedCsv = exportSkuAuditCsv(audit);
      return sendText(res, 200, 'text/csv; charset=utf-8', exportedCsv, {
        'Content-Disposition': 'attachment; filename="sugartaxae-sku-audit.csv"',
        'Cache-Control': 'no-store',
      });
    }

    if (method === 'POST' && routePath === '/api/assess') {
      const body = await readJsonBody(req, maxBodyBytes);
      const input = resolveAssessmentInput(body);
      const result = await assessSugarTaxReadiness(input);
      return sendJson(res, 200, { ok: true, input, result });
    }

    if (routePath === '/api/profiles' && method === 'GET') {
      const rows = db.prepare('SELECT * FROM profiles ORDER BY updated_at DESC, id DESC').all();
      return sendJson(res, 200, { ok: true, profiles: rows.map(mapProfileRow) });
    }

    if (routePath === '/api/profiles' && method === 'POST') {
      const body = await readJsonBody(req, maxBodyBytes);
      const organizationName = String(body.organizationName || '').trim();
      if (!organizationName) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'organizationName is required.');
      }
      const trnNumber = String(body.trnNumber || '100512904300003').trim();
      const beverageCategory = validateEnumField(
        body.beverageCategory ? String(body.beverageCategory).trim() : 'sweetened_beverage',
        VALID_CATEGORIES,
        'beverageCategory',
      );
      const productFormat = validateEnumField(
        body.productFormat ? String(body.productFormat).trim() : 'ready_to_drink',
        VALID_FORMATS,
        'productFormat',
      );
      const taxPeriodEndDate = body.taxPeriodEndDate
        ? validateIsoDate(String(body.taxPeriodEndDate).trim(), 'taxPeriodEndDate')
        : '2026-01-31';
      const notes = String(body.notes || '').trim();
      const now = new Date().toISOString();

      const inserted = db
        .prepare(
          `INSERT INTO profiles (
             organization_name, trn_number, beverage_category, product_format, tax_period_end_date,
             notes, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .get(
          organizationName,
          trnNumber,
          beverageCategory,
          productFormat,
          taxPeriodEndDate,
          notes,
          now,
          now,
        );
      return sendJson(res, 201, { ok: true, profile: mapProfileRow(inserted) });
    }

    const profileMatch = routePath.match(/^\/api\/profiles\/(\d+)$/);
    if (profileMatch) {
      const profileId = Number(profileMatch[1]);
      const existing = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
      if (!existing) {
        throw new HttpError(404, 'PROFILE_NOT_FOUND', `Profile ${profileId} not found.`);
      }
      if (method === 'GET') {
        return sendJson(res, 200, { ok: true, profile: mapProfileRow(existing) });
      }
      if (method === 'PATCH') {
        const body = await readJsonBody(req, maxBodyBytes);
        const organizationName =
          body.organizationName !== undefined
            ? String(body.organizationName).trim()
            : existing.organization_name;
        if (!organizationName) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'organizationName cannot be empty.');
        }
        const trnNumber =
          body.trnNumber !== undefined ? String(body.trnNumber).trim() : existing.trn_number;
        const beverageCategory = validateEnumField(
          body.beverageCategory !== undefined
            ? String(body.beverageCategory).trim()
            : existing.beverage_category,
          VALID_CATEGORIES,
          'beverageCategory',
        );
        const productFormat = validateEnumField(
          body.productFormat !== undefined
            ? String(body.productFormat).trim()
            : existing.product_format,
          VALID_FORMATS,
          'productFormat',
        );
        const taxPeriodEndDate =
          body.taxPeriodEndDate !== undefined
            ? validateIsoDate(String(body.taxPeriodEndDate).trim(), 'taxPeriodEndDate')
            : existing.tax_period_end_date;
        const notes = body.notes !== undefined ? String(body.notes).trim() : existing.notes;
        const now = new Date().toISOString();

        const updated = db
          .prepare(
            `UPDATE profiles
             SET organization_name = ?, trn_number = ?, beverage_category = ?, product_format = ?,
                 tax_period_end_date = ?, notes = ?, updated_at = ?
             WHERE id = ?
             RETURNING *`,
          )
          .get(
            organizationName,
            trnNumber,
            beverageCategory,
            productFormat,
            taxPeriodEndDate,
            notes,
            now,
            profileId,
          );
        return sendJson(res, 200, { ok: true, profile: mapProfileRow(updated) });
      }
      if (method === 'DELETE') {
        db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId);
        return sendJson(res, 200, { ok: true, deletedId: profileId });
      }
    }

    const isCollection = routePath === '/api/assessments' || routePath === '/api/dossiers';
    if (isCollection && method === 'GET') {
      const statusFilter = (urlObj.searchParams.get('status') || '').trim().toLowerCase();
      const searchQ = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
      let rows = db.prepare('SELECT * FROM assessments ORDER BY updated_at DESC, id DESC').all();
      if (statusFilter) {
        rows = rows.filter((r) => r.status.toLowerCase() === statusFilter);
      }
      if (searchQ) {
        rows = rows.filter(
          (r) =>
            r.dossier_code.toLowerCase().includes(searchQ) ||
            r.organization_name.toLowerCase().includes(searchQ) ||
            r.trn_number.toLowerCase().includes(searchQ) ||
            r.beverage_category.toLowerCase().includes(searchQ) ||
            r.title.toLowerCase().includes(searchQ),
        );
      }
      return sendJson(res, 200, {
        ok: true,
        items: rows.map(mapAssessmentRow),
        total: rows.length,
      });
    }

    if (isCollection && method === 'POST') {
      const body = await readJsonBody(req, maxBodyBytes);
      let profileId = null;
      let profileBase = null;
      if (body.profileId !== undefined && body.profileId !== null) {
        const pid = Number(body.profileId);
        const prof = db.prepare('SELECT * FROM profiles WHERE id = ?').get(pid);
        if (!prof) {
          throw new HttpError(404, 'PROFILE_NOT_FOUND', `Profile ${pid} not found.`);
        }
        profileId = pid;
        profileBase = {
          ...SUGAR_PRESETS[0].input,
          organizationName: prof.organization_name,
          trnNumber: prof.trn_number,
          beverageCategory: prof.beverage_category,
          productFormat: prof.product_format,
          taxPeriodEndDate: prof.tax_period_end_date,
          notes: prof.notes,
        };
      }

      const input = resolveAssessmentInput(body, profileBase);
      const result = await assessSugarTaxReadiness(input);
      const inserted = insertAssessmentRecord(db, {
        profileId,
        title: typeof body.title === 'string' ? body.title : undefined,
        input,
        result,
      });
      return sendJson(res, 201, { ok: true, item: mapAssessmentRow(inserted) });
    }

    const itemMatch = routePath.match(
      /^\/api\/(?:assessments|dossiers)\/([^/]+)(?:\/(duplicate|finalize|lock|brief\.md|export\.csv|summary))?$/,
    );
    if (itemMatch) {
      const idOrCode = itemMatch[1];
      const action = itemMatch[2] || '';
      const row = findAssessmentRow(db, idOrCode);
      if (!row) {
        throw new HttpError(404, 'DOSSIER_NOT_FOUND', `SugarTaxAE dossier "${idOrCode}" not found.`);
      }

      if (!action && method === 'GET') {
        return sendJson(res, 200, { ok: true, item: mapAssessmentRow(row) });
      }

      if (!action && method === 'PATCH') {
        if (row.locked_at) {
          throw new HttpError(
            409,
            'DOSSIER_LOCKED',
            'Sealed dossier is immutable and cannot be edited.',
            { dossierCode: row.dossier_code, lockedAt: row.locked_at },
          );
        }
        const body = await readJsonBody(req, maxBodyBytes);
        const prevInput = JSON.parse(row.input_json);
        const nextInput = resolveAssessmentInput(body, prevInput);
        const result = await assessSugarTaxReadiness(nextInput);
        const title =
          body.title !== undefined && String(body.title).trim()
            ? String(body.title).trim()
            : row.title;
        const now = new Date().toISOString();

        const updated = db
          .prepare(
            `UPDATE assessments
             SET title = ?, organization_name = ?, trn_number = ?, tax_period_end_date = ?,
                 beverage_category = ?, product_format = ?, status = ?, readiness_score = ?,
                 applied_rate_aed_per_l = ?, volumetric_excise_aed = ?, total_exposure_aed = ?,
                 active_gap_count = ?, input_json = ?, result_json = ?, canonical_text = ?,
                 dossier_sha256 = ?, updated_at = ?
             WHERE id = ?
             RETURNING *`,
          )
          .get(
            title,
            nextInput.organizationName,
            nextInput.trnNumber,
            nextInput.taxPeriodEndDate,
            nextInput.beverageCategory,
            nextInput.productFormat,
            result.status,
            result.readinessScore,
            result.tierEval.appliedRateAedPerL,
            result.tierEval.volumetricExcise2026Aed,
            result.exposure.totalFinancialExposureAed,
            result.activeGapCount,
            JSON.stringify(nextInput),
            JSON.stringify(result),
            result.canonicalDossierText,
            result.dossierSha256,
            now,
            row.id,
          );
        return sendJson(res, 200, { ok: true, item: mapAssessmentRow(updated) });
      }

      if (!action && method === 'DELETE') {
        if (row.locked_at) {
          throw new HttpError(409, 'DOSSIER_LOCKED', 'Sealed dossier cannot be deleted.', {
            dossierCode: row.dossier_code,
            lockedAt: row.locked_at,
          });
        }
        db.prepare('DELETE FROM assessments WHERE id = ?').run(row.id);
        return sendJson(res, 200, {
          ok: true,
          deletedId: row.id,
          dossierCode: row.dossier_code,
        });
      }

      if (action === 'duplicate' && method === 'POST') {
        const body = await readJsonBody(req, maxBodyBytes);
        const sourceInput = JSON.parse(row.input_json);
        const result = await assessSugarTaxReadiness(sourceInput);
        const copyTitle =
          body.title && String(body.title).trim()
            ? String(body.title).trim()
            : `${row.title} (Copy)`;
        const cloned = insertAssessmentRecord(db, {
          profileId: row.profile_id,
          title: copyTitle,
          input: sourceInput,
          result,
        });
        return sendJson(res, 201, { ok: true, item: mapAssessmentRow(cloned) });
      }

      if ((action === 'finalize' || action === 'lock') && method === 'POST') {
        if (row.locked_at) {
          throw new HttpError(
            409,
            'ALREADY_LOCKED',
            'Dossier is already finalized and cryptographically sealed.',
            {
              dossierCode: row.dossier_code,
              lockedAt: row.locked_at,
              dossierSha256: row.dossier_sha256,
              publicSlug: row.public_slug,
            },
          );
        }
        const sourceInput = JSON.parse(row.input_json);
        const result = await assessSugarTaxReadiness(sourceInput);
        const publicSlug = row.public_slug || generatePublicSlug();
        const now = new Date().toISOString();
        const sealed = db
          .prepare(
            `UPDATE assessments
             SET status = ?, readiness_score = ?, applied_rate_aed_per_l = ?,
                 volumetric_excise_aed = ?, total_exposure_aed = ?, active_gap_count = ?,
                 result_json = ?, canonical_text = ?, dossier_sha256 = ?,
                 public_slug = ?, locked_at = ?, updated_at = ?
             WHERE id = ?
             RETURNING *`,
          )
          .get(
            result.status,
            result.readinessScore,
            result.tierEval.appliedRateAedPerL,
            result.tierEval.volumetricExcise2026Aed,
            result.exposure.totalFinancialExposureAed,
            result.activeGapCount,
            JSON.stringify(result),
            result.canonicalDossierText,
            result.dossierSha256,
            publicSlug,
            now,
            now,
            row.id,
          );
        return sendJson(res, 200, { ok: true, item: mapAssessmentRow(sealed) });
      }

      if (action === 'brief.md' && method === 'GET') {
        const langRaw = (
          urlObj.searchParams.get('lang') ||
          urlObj.searchParams.get('locale') ||
          'ar'
        )
          .trim()
          .toLowerCase();
        const locale = langRaw === 'en' ? 'en' : 'ar';
        const item = mapAssessmentRow(row);
        const md = buildSugarBriefMarkdown(
          item.input,
          item.result,
          item.dossierCode,
          item.dossierSha256,
          locale,
        );
        const safeFilename = item.dossierCode.replace(/[^A-Za-z0-9_-]/g, '');
        return sendText(res, 200, 'text/markdown; charset=utf-8', md, {
          'Content-Disposition': `attachment; filename="${safeFilename}.${locale}.brief.md"`,
          'Cache-Control': 'no-store',
        });
      }

      if (action === 'export.csv' && method === 'GET') {
        const item = mapAssessmentRow(row);
        const csvContent =
          item.result.csvAudit && item.result.csvAudit.rows.length > 0
            ? exportSkuAuditCsv(item.result.csvAudit)
            : buildFallbackSummaryCsv(item);
        const safeFilename = item.dossierCode.replace(/[^A-Za-z0-9_-]/g, '');
        return sendText(res, 200, 'text/csv; charset=utf-8', csvContent, {
          'Content-Disposition': `attachment; filename="${safeFilename}.sku-audit.csv"`,
          'Cache-Control': 'no-store',
        });
      }

      if (action === 'summary' && method === 'GET') {
        const item = mapAssessmentRow(row);
        const langRaw = (
          urlObj.searchParams.get('lang') ||
          urlObj.searchParams.get('locale') ||
          'ar'
        )
          .trim()
          .toLowerCase();
        const locale = langRaw === 'en' ? 'en' : 'ar';
        const briefMarkdown = buildSugarBriefMarkdown(
          item.input,
          item.result,
          item.dossierCode,
          item.dossierSha256,
          locale,
        );
        return sendJson(res, 200, {
          ok: true,
          dossierCode: item.dossierCode,
          title: item.title,
          organizationName: item.organizationName,
          trnNumber: item.trnNumber,
          taxPeriodEndDate: item.taxPeriodEndDate,
          beverageCategory: item.beverageCategory,
          productFormat: item.productFormat,
          status: item.status,
          readinessScore: item.readinessScore,
          lockedAt: item.lockedAt,
          publicSlug: item.publicSlug,
          dossierSha256: item.dossierSha256,
          legalDisclaimerEn: item.result.legalDisclaimerEn,
          legalDisclaimerAr: item.result.legalDisclaimerAr,
          tierEval: item.result.tierEval,
          exposure: item.result.exposure,
          csvAuditSummary: item.result.csvAudit
            ? {
                totalRows: item.result.csvAudit.totalRows,
                readyCount: item.result.csvAudit.readyCount,
                conditionalCount: item.result.csvAudit.conditionalCount,
                blockedCount: item.result.csvAudit.blockedCount,
                totalReconstitutedLitres: item.result.csvAudit.totalReconstitutedLitres,
                totalExciseLiabilityAed: item.result.csvAudit.totalExciseLiabilityAed,
                totalMoIatOverpaymentRiskAed: item.result.csvAudit.totalMoIatOverpaymentRiskAed,
                formulaSanitizedCount: item.result.csvAudit.formulaSanitizedCount,
              }
            : null,
          topFindings: item.result.findings.slice(0, 6),
          briefMarkdown,
        });
      }
    }

    const publicMatch = routePath.match(/^\/api\/public\/reports\/([^/]+)$/);
    if (publicMatch && method === 'GET') {
      const slugOrCode = decodeURIComponent(publicMatch[1]).trim();
      const row = db
        .prepare(
          'SELECT * FROM assessments WHERE (public_slug = ? OR dossier_code = ?) AND locked_at IS NOT NULL',
        )
        .get(slugOrCode, slugOrCode);
      if (!row) {
        throw new HttpError(
          404,
          'PUBLIC_REPORT_NOT_FOUND',
          `Published sealed SugarTaxAE report "${slugOrCode}" was not found.`,
        );
      }

      const now = new Date().toISOString();
      const viewRow = db
        .prepare(
          `INSERT INTO public_report_views (slug_or_code, view_count, last_viewed_at)
           VALUES (?, 1, ?)
           ON CONFLICT(slug_or_code) DO UPDATE SET
             view_count = view_count + 1,
             last_viewed_at = excluded.last_viewed_at
           RETURNING view_count, last_viewed_at`,
        )
        .get(row.dossier_code, now);

      const item = mapAssessmentRow(row);
      return sendJson(res, 200, {
        ok: true,
        viewCount: Number(viewRow?.view_count ?? 1),
        lastViewedAt: viewRow?.last_viewed_at ?? now,
        report: {
          dossierCode: item.dossierCode,
          publicSlug: item.publicSlug,
          organizationName: item.organizationName,
          trnNumber: item.trnNumber,
          taxPeriodEndDate: item.taxPeriodEndDate,
          beverageCategory: item.beverageCategory,
          productFormat: item.productFormat,
          status: item.status,
          readinessScore: item.readinessScore,
          lockedAt: item.lockedAt,
          dossierSha256: item.dossierSha256,
          legalDisclaimerEn: item.result.legalDisclaimerEn,
          legalDisclaimerAr: item.result.legalDisclaimerAr,
          tierEval: item.result.tierEval,
          exposure: item.result.exposure,
          briefAr: buildSugarBriefMarkdown(
            item.input,
            item.result,
            item.dossierCode,
            item.dossierSha256,
            'ar',
          ),
          briefEn: buildSugarBriefMarkdown(
            item.input,
            item.result,
            item.dossierCode,
            item.dossierSha256,
            'en',
          ),
        },
      });
    }

    if (routePath.startsWith('/api/')) {
      throw new HttpError(404, 'API_NOT_FOUND', `Unknown API endpoint: ${method} ${routePath}`);
    }

    if (method === 'GET' || method === 'HEAD') {
      return tryServeStatic(res, routePath, method);
    }

    throw new HttpError(405, 'METHOD_NOT_ALLOWED', `Method ${method} not allowed on ${routePath}`);
  }

  const server = http.createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      if (err instanceof HttpError) {
        return sendJson(res, err.status, {
          ok: false,
          error: err.code,
          message: err.message,
          ...err.extra,
        });
      }
      return sendJson(res, 500, {
        ok: false,
        error: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Unexpected server error',
      });
    });
  });

  return {
    server,
    db,
    basePath,
    async listen(port = Number(options.port ?? 0), host = options.host || '127.0.0.1') {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      const addr = server.address();
      const boundPort = typeof addr === 'object' && addr ? addr.port : port;
      return {
        port: boundPort,
        host,
        url: `http://${host}:${boundPort}${basePath}`,
      };
    },
    async close() {
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
      closeDb(db);
    },
  };
}
