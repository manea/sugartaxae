import {
  assessSugarTaxReadiness,
  buildSugarBriefMarkdown,
  exportSkuAuditCsv,
  sanitizeCsvCell,
} from '../core/index.ts';
import type { AssessmentInput, AssessmentResult } from '../core/types.ts';
import { withBase } from './basePath.ts';
import type { Locale } from './i18n.ts';

export type ApiMode = 'server' | 'local';

export interface SugarTaxDossierRecord {
  id: number | string;
  profileId: number | string | null;
  dossierCode: string;
  title: string;
  organizationName: string;
  trnNumber: string;
  taxPeriodEndDate: string;
  beverageCategory: AssessmentInput['beverageCategory'];
  productFormat: AssessmentInput['productFormat'];
  status: AssessmentResult['status'];
  readinessScore: number;
  appliedRateAedPerL: number;
  volumetricExciseAed: number;
  totalExposureAed: number;
  activeGapCount: number;
  canonicalText: string;
  dossierSha256: string;
  publicSlug: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  input: AssessmentInput;
  result: AssessmentResult;
}

export interface PublicSugarTaxReport {
  viewCount: number;
  lastViewedAt: string;
  report: {
    dossierCode: string;
    publicSlug: string;
    organizationName: string;
    trnNumber: string;
    taxPeriodEndDate: string;
    beverageCategory: AssessmentInput['beverageCategory'];
    productFormat: AssessmentInput['productFormat'];
    status: AssessmentResult['status'];
    readinessScore: number;
    lockedAt: string;
    dossierSha256: string;
    legalDisclaimerEn: string;
    legalDisclaimerAr: string;
    tierEval: AssessmentResult['tierEval'];
    exposure: AssessmentResult['exposure'];
    briefAr: string;
    briefEn: string;
  };
}

const LS_DOSSIERS = 'sugartaxae.v1.dossiers';
const LS_SEQ = 'sugartaxae.v1.seq';
const LS_VIEWS = 'sugartaxae.v1.views';

function readLocalList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeLocalList<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

function allocateLocalDossierCode(taxPeriodEndDate: string): string {
  const yearNum = Number(String(taxPeriodEndDate).slice(0, 4));
  const year = Number.isInteger(yearNum) && yearNum >= 2024 ? yearNum : new Date().getUTCFullYear();
  let seqMap: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(LS_SEQ);
    seqMap = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    seqMap = {};
  }
  const next = Number(seqMap[String(year)] ?? 0) + 1;
  seqMap[String(year)] = next;
  localStorage.setItem(LS_SEQ, JSON.stringify(seqMap));
  return `EX-${year}-${String(next).padStart(4, '0')}`;
}

function makeLocalSlug(dossierCode: string): string {
  return `ex-${dossierCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const payload = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  return payload as T;
}

export async function detectServerMode(): Promise<ApiMode> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1600);
    const res = await fetch(withBase('/health'), {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return 'local';
    const data = (await res.json()) as { ok?: boolean; service?: string };
    return data.ok && data.service === 'sugartaxae' ? 'server' : 'local';
  } catch {
    return 'local';
  }
}

export async function listDossiers(mode: ApiMode): Promise<SugarTaxDossierRecord[]> {
  if (mode === 'server') {
    const data = await fetchJson<{ items?: SugarTaxDossierRecord[] }>(
      withBase('/api/dossiers?limit=50'),
    );
    return Array.isArray(data.items) ? data.items : [];
  }
  return readLocalList<SugarTaxDossierRecord>(LS_DOSSIERS).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function saveDossier(
  mode: ApiMode,
  input: AssessmentInput,
  title?: string,
): Promise<SugarTaxDossierRecord> {
  if (mode === 'server') {
    const data = await fetchJson<{ item: SugarTaxDossierRecord }>(withBase('/api/dossiers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title?.trim() || `${input.organizationName} — ${input.productName}`,
        input,
      }),
    });
    return data.item;
  }

  const result = await assessSugarTaxReadiness(input);
  const now = new Date().toISOString();
  const dossierCode = allocateLocalDossierCode(input.taxPeriodEndDate);
  const record: SugarTaxDossierRecord = {
    id: dossierCode,
    profileId: null,
    dossierCode,
    title: title?.trim() || `${input.organizationName} — ${input.productName}`,
    organizationName: input.organizationName,
    trnNumber: input.trnNumber,
    taxPeriodEndDate: input.taxPeriodEndDate,
    beverageCategory: input.beverageCategory,
    productFormat: input.productFormat,
    status: result.status,
    readinessScore: result.readinessScore,
    appliedRateAedPerL: result.tierEval.appliedRateAedPerL,
    volumetricExciseAed: result.tierEval.volumetricExcise2026Aed,
    totalExposureAed: result.exposure.totalFinancialExposureAed,
    activeGapCount: result.activeGapCount,
    canonicalText: result.canonicalDossierText,
    dossierSha256: result.dossierSha256,
    publicSlug: null,
    lockedAt: null,
    createdAt: now,
    updatedAt: now,
    input: structuredClone(input),
    result,
  };
  const existing = readLocalList<SugarTaxDossierRecord>(LS_DOSSIERS);
  writeLocalList(LS_DOSSIERS, [record, ...existing]);
  return record;
}

export async function finalizeDossier(
  mode: ApiMode,
  record: SugarTaxDossierRecord,
): Promise<SugarTaxDossierRecord> {
  if (mode === 'server') {
    const data = await fetchJson<{ item: SugarTaxDossierRecord }>(
      withBase(`/api/dossiers/${encodeURIComponent(record.dossierCode)}/finalize`),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    return data.item;
  }

  const items = readLocalList<SugarTaxDossierRecord>(LS_DOSSIERS);
  const target = items.find((i) => i.dossierCode === record.dossierCode);
  if (!target) throw new Error('Dossier not found in local storage.');
  if (target.lockedAt) throw new Error('Dossier is already finalized and sealed.');

  const result = await assessSugarTaxReadiness(target.input);
  const now = new Date().toISOString();
  const sealed: SugarTaxDossierRecord = {
    ...target,
    status: result.status,
    readinessScore: result.readinessScore,
    appliedRateAedPerL: result.tierEval.appliedRateAedPerL,
    volumetricExciseAed: result.tierEval.volumetricExcise2026Aed,
    totalExposureAed: result.exposure.totalFinancialExposureAed,
    activeGapCount: result.activeGapCount,
    canonicalText: result.canonicalDossierText,
    dossierSha256: result.dossierSha256,
    publicSlug: target.publicSlug || makeLocalSlug(target.dossierCode),
    lockedAt: now,
    updatedAt: now,
    result,
  };
  writeLocalList(
    LS_DOSSIERS,
    items.map((i) => (i.dossierCode === target.dossierCode ? sealed : i)),
  );
  return sealed;
}

export async function duplicateDossier(
  mode: ApiMode,
  record: SugarTaxDossierRecord,
): Promise<SugarTaxDossierRecord> {
  if (mode === 'server') {
    const data = await fetchJson<{ item: SugarTaxDossierRecord }>(
      withBase(`/api/dossiers/${encodeURIComponent(record.dossierCode)}/duplicate`),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    return data.item;
  }
  return saveDossier(mode, record.input, `${record.title} (Copy)`);
}

export async function deleteDossier(
  mode: ApiMode,
  record: SugarTaxDossierRecord,
): Promise<void> {
  if (mode === 'server') {
    await fetchJson<{ ok: boolean }>(
      withBase(`/api/dossiers/${encodeURIComponent(record.dossierCode)}`),
      { method: 'DELETE' },
    );
    return;
  }
  const items = readLocalList<SugarTaxDossierRecord>(LS_DOSSIERS);
  const target = items.find((i) => i.dossierCode === record.dossierCode);
  if (target?.lockedAt) {
    throw new Error('Sealed dossier cannot be deleted.');
  }
  writeLocalList(
    LS_DOSSIERS,
    items.filter((i) => i.dossierCode !== record.dossierCode),
  );
}

export async function fetchBriefMarkdown(
  mode: ApiMode,
  record: SugarTaxDossierRecord,
  locale: Locale,
): Promise<string> {
  if (mode === 'server') {
    const res = await fetch(
      withBase(`/api/dossiers/${encodeURIComponent(record.dossierCode)}/brief.md?lang=${locale}`),
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }
  return buildSugarBriefMarkdown(
    record.input,
    record.result,
    record.dossierCode,
    record.dossierSha256,
    locale,
  );
}

function formatSummaryCsvCell(val: unknown): string {
  const safe = sanitizeCsvCell(val);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildLocalSummaryCsv(record: SugarTaxDossierRecord): string {
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
    formatSummaryCsvCell(record.dossierCode),
    formatSummaryCsvCell(record.organizationName),
    formatSummaryCsvCell(record.trnNumber),
    formatSummaryCsvCell(record.input.productName),
    formatSummaryCsvCell(record.taxPeriodEndDate),
    formatSummaryCsvCell(record.result.tierEval.emaraTaxReturnDueDate),
    formatSummaryCsvCell(record.beverageCategory),
    formatSummaryCsvCell(record.productFormat),
    record.input.sugarGramsPer100mlReady,
    record.result.tierEval.reconstitutedLitres,
    formatSummaryCsvCell(record.result.tierEval.appliedTier),
    record.appliedRateAedPerL,
    record.volumetricExciseAed,
    record.totalExposureAed,
    formatSummaryCsvCell(record.status),
    record.readinessScore,
    formatSummaryCsvCell(record.dossierSha256),
  ].join(',');
  return `\uFEFF${header}\r\n${row}\r\n`;
}

export async function fetchExportCsv(
  mode: ApiMode,
  record: SugarTaxDossierRecord,
): Promise<string> {
  if (mode === 'server') {
    const res = await fetch(
      withBase(`/api/dossiers/${encodeURIComponent(record.dossierCode)}/export.csv`),
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    const decoded = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    return decoded.startsWith('\uFEFF') ? decoded : `\uFEFF${decoded}`;
  }
  if (record.result.csvAudit && record.result.csvAudit.rows.length > 0) {
    return exportSkuAuditCsv(record.result.csvAudit);
  }
  return buildLocalSummaryCsv(record);
}

export async function fetchPublicReport(
  mode: ApiMode,
  slugOrCode: string,
): Promise<PublicSugarTaxReport> {
  if (mode === 'server') {
    return fetchJson<PublicSugarTaxReport>(
      withBase(`/api/public/reports/${encodeURIComponent(slugOrCode)}`),
    );
  }

  const items = readLocalList<SugarTaxDossierRecord>(LS_DOSSIERS);
  const found = items.find(
    (item) =>
      item.lockedAt && (item.publicSlug === slugOrCode || item.dossierCode === slugOrCode),
  );
  if (!found || !found.lockedAt) {
    throw new Error('Published sealed SugarTaxAE report was not found.');
  }

  let viewMap: Record<string, { viewCount: number; lastViewedAt: string }> = {};
  try {
    const raw = localStorage.getItem(LS_VIEWS);
    viewMap = raw ? (JSON.parse(raw) as typeof viewMap) : {};
  } catch {
    viewMap = {};
  }
  const now = new Date().toISOString();
  const prevCount = Number(viewMap[found.dossierCode]?.viewCount ?? 0);
  const viewCount = prevCount + 1;
  viewMap[found.dossierCode] = { viewCount, lastViewedAt: now };
  localStorage.setItem(LS_VIEWS, JSON.stringify(viewMap));

  return {
    viewCount,
    lastViewedAt: now,
    report: {
      dossierCode: found.dossierCode,
      publicSlug: found.publicSlug || makeLocalSlug(found.dossierCode),
      organizationName: found.organizationName,
      trnNumber: found.trnNumber,
      taxPeriodEndDate: found.taxPeriodEndDate,
      beverageCategory: found.beverageCategory,
      productFormat: found.productFormat,
      status: found.status,
      readinessScore: found.readinessScore,
      lockedAt: found.lockedAt,
      dossierSha256: found.dossierSha256,
      legalDisclaimerEn: found.result.legalDisclaimerEn,
      legalDisclaimerAr: found.result.legalDisclaimerAr,
      tierEval: found.result.tierEval,
      exposure: found.result.exposure,
      briefAr: buildSugarBriefMarkdown(
        found.input,
        found.result,
        found.dossierCode,
        found.dossierSha256,
        'ar',
      ),
      briefEn: buildSugarBriefMarkdown(
        found.input,
        found.result,
        found.dossierCode,
        found.dossierSha256,
        'en',
      ),
    },
  };
}
