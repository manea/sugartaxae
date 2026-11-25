import { HIGH_TIER_RATE_AED_PER_L } from './sugarTaxCatalog.ts';
import { classifySugarTier, nonNegative, roundAed } from './tierAndRateEngine.ts';
import type {
  BeverageCategory,
  ProductFormat,
  ReadinessStatus,
  SkuCsvAuditSummary,
  SkuCsvRowAudit,
  SugarTier,
} from './types.ts';

const FORMULA_PREFIX_RE = /^[\t\r ]*[=+\-@]|^[\t\r]/;

export function needsCsvFormulaSanitization(raw: string): boolean {
  return FORMULA_PREFIX_RE.test(raw);
}

export function sanitizeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (text.length === 0) return '';
  return needsCsvFormulaSanitization(text) ? `'${text}` : text;
}

function formatCsvField(value: unknown): string {
  const safe = sanitizeCsvCell(value);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function parseCsvGrid(csvText: string): { rows: string[][]; error: string | null } {
  const clean = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      if (field.length > 0) {
        return { rows: [], error: 'Malformed quote inside unquoted CSV field.' };
      }
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    return { rows: [], error: 'Unclosed quoted field in CSV input.' };
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return {
    rows: rows.filter((r) => !(r.length === 1 && r[0]!.trim() === '')),
    error: null,
  };
}

function parseCategory(raw: string): BeverageCategory | null {
  const norm = raw.trim().toLowerCase().replace(/[\s\-]+/g, '_');
  if (norm === 'sweetened_beverage' || norm === 'sweetened' || norm === 'soda') {
    return 'sweetened_beverage';
  }
  if (norm === 'energy_drink' || norm === 'energy') {
    return 'energy_drink';
  }
  if (norm === 'milk_dairy_75plus' || norm === 'dairy' || norm === 'milk') {
    return 'milk_dairy_75plus';
  }
  if (norm === 'natural_juice_100pct' || norm === 'juice' || norm === 'natural_juice') {
    return 'natural_juice_100pct';
  }
  return null;
}

function parseFormat(raw: string): ProductFormat {
  const norm = raw.trim().toLowerCase().replace(/[\s\-]+/g, '_');
  if (norm === 'liquid_concentrate' || norm === 'concentrate') return 'liquid_concentrate';
  if (norm === 'powder_sachet' || norm === 'powder') return 'powder_sachet';
  if (norm === 'gel_extract' || norm === 'gel') return 'gel_extract';
  return 'ready_to_drink';
}

function parseBool(raw: string): boolean | null {
  const norm = raw.trim().toLowerCase();
  if (norm === 'true' || norm === 'yes' || norm === '1') return true;
  if (norm === 'false' || norm === 'no' || norm === '0') return false;
  return null;
}

export function auditSkuCsv(csvText: string): SkuCsvAuditSummary {
  const parseErrors: string[] = [];
  const rows: SkuCsvRowAudit[] = [];

  if (!csvText || !csvText.trim()) {
    parseErrors.push('SKU CSV input is empty.');
    return {
      totalRows: 0,
      readyCount: 0,
      conditionalCount: 0,
      blockedCount: 0,
      totalReconstitutedLitres: 0,
      totalExciseLiabilityAed: 0,
      totalMoIatOverpaymentRiskAed: 0,
      missingLabCount: 0,
      formulaSanitizedCount: 0,
      rows: [],
      parseErrors,
    };
  }

  const parsed = parseCsvGrid(csvText);
  if (parsed.error) {
    parseErrors.push(parsed.error);
    return {
      totalRows: 0,
      readyCount: 0,
      conditionalCount: 0,
      blockedCount: 0,
      totalReconstitutedLitres: 0,
      totalExciseLiabilityAed: 0,
      totalMoIatOverpaymentRiskAed: 0,
      missingLabCount: 0,
      formulaSanitizedCount: 0,
      rows: [],
      parseErrors,
    };
  }

  if (parsed.rows.length < 2) {
    parseErrors.push('SKU CSV must include headers and at least one product row.');
    return {
      totalRows: 0,
      readyCount: 0,
      conditionalCount: 0,
      blockedCount: 0,
      totalReconstitutedLitres: 0,
      totalExciseLiabilityAed: 0,
      totalMoIatOverpaymentRiskAed: 0,
      missingLabCount: 0,
      formulaSanitizedCount: 0,
      rows: [],
      parseErrors,
    };
  }

  const headers = parsed.rows[0]!.map((h) => h.trim().toLowerCase().replace(/[\s\-]+/g, '_'));
  const idx = {
    sku: headers.findIndex((h) => h === 'sku_code' || h === 'sku' || h === 'id'),
    name: headers.findIndex((h) => h === 'product_name' || h === 'name' || h === 'product'),
    category: headers.findIndex((h) => h === 'beverage_category' || h === 'category'),
    format: headers.findIndex((h) => h === 'product_format' || h === 'format'),
    sugar: headers.findIndex((h) => h === 'sugar_g_per_100ml' || h === 'sugar_per_100ml' || h === 'sugar'),
    units: headers.findIndex((h) => h === 'base_units_or_litres' || h === 'litres' || h === 'volume_l'),
    ratio: headers.findIndex((h) => h === 'reconstitution_ratio' || h === 'dilution_ratio'),
    cert: headers.findIndex((h) => h === 'moiat_certified' || h === 'lab_certified'),
    price: headers.findIndex((h) => h === 'retail_price_aed_per_l' || h === 'price_aed_per_l'),
  };

  if (idx.name === -1 || idx.sugar === -1 || idx.units === -1) {
    parseErrors.push('Missing required CSV headers: product_name, sugar_g_per_100ml, base_units_or_litres.');
    return {
      totalRows: 0,
      readyCount: 0,
      conditionalCount: 0,
      blockedCount: 0,
      totalReconstitutedLitres: 0,
      totalExciseLiabilityAed: 0,
      totalMoIatOverpaymentRiskAed: 0,
      missingLabCount: 0,
      formulaSanitizedCount: 0,
      rows: [],
      parseErrors,
    };
  }

  let readyCount = 0;
  let conditionalCount = 0;
  let blockedCount = 0;
  let totalReconstitutedLitres = 0;
  let totalExciseLiabilityAed = 0;
  let totalMoIatOverpaymentRiskAed = 0;
  let missingLabCount = 0;
  let formulaSanitizedCount = 0;

  for (let r = 1; r < parsed.rows.length; r += 1) {
    const raw = parsed.rows[r]!;
    const rowNumber = r + 1;
    const issues: string[] = [];

    const rawSku = idx.sku >= 0 ? (raw[idx.sku] ?? '').trim() : `SKU-${r}`;
    const rawName = (raw[idx.name] ?? '').trim();
    const rawCat = idx.category >= 0 ? (raw[idx.category] ?? '').trim() : 'sweetened_beverage';
    const rawFmt = idx.format >= 0 ? (raw[idx.format] ?? '').trim() : 'ready_to_drink';
    const rawSugar = (raw[idx.sugar] ?? '').trim();
    const rawUnits = (raw[idx.units] ?? '').trim();
    const rawRatio = idx.ratio >= 0 ? (raw[idx.ratio] ?? '').trim() : '1';
    const rawCert = idx.cert >= 0 ? (raw[idx.cert] ?? '').trim() : 'false';
    const rawPrice = idx.price >= 0 ? (raw[idx.price] ?? '').trim() : '10';

    let rowSanitized = false;
    for (const c of [rawSku, rawName, rawCat, rawFmt]) {
      if (needsCsvFormulaSanitization(c)) {
        formulaSanitizedCount += 1;
        rowSanitized = true;
      }
    }
    if (rowSanitized) {
      issues.push('CWE-1236 formula payload neutralized.');
    }

    const skuCode = sanitizeCsvCell(rawSku || `SKU-${r}`);
    const productName = sanitizeCsvCell(rawName || `Beverage-${r}`);
    const parsedCat = parseCategory(rawCat);
    const beverageCategory: BeverageCategory = parsedCat ?? 'sweetened_beverage';
    if (!parsedCat) {
      parseErrors.push(`Row ${rowNumber}: unrecognized beverage_category "${sanitizeCsvCell(rawCat)}".`);
    }

    const productFormat = parseFormat(rawFmt);
    const sugarNum = Number(rawSugar);
    const unitsNum = Number(rawUnits);
    const ratioNum = Number(rawRatio);
    const priceNum = Number(rawPrice);

    if (rawSugar === '' || !Number.isFinite(sugarNum) || sugarNum < 0) {
      parseErrors.push(`Row ${rowNumber}: invalid sugar_g_per_100ml "${sanitizeCsvCell(rawSugar)}".`);
    }
    if (rawUnits === '' || !Number.isFinite(unitsNum) || unitsNum < 0) {
      parseErrors.push(`Row ${rowNumber}: invalid base_units_or_litres "${sanitizeCsvCell(rawUnits)}".`);
    }

    const sugarPer100ml = nonNegative(sugarNum);
    const ratio = productFormat === 'ready_to_drink' ? 1 : Math.max(0.01, nonNegative(ratioNum) || 1);
    const reconstitutedLitres = roundAed(nonNegative(unitsNum) * ratio);
    const moIatCertified = parseBool(rawCert) ?? false;

    const implied = classifySugarTier({
      beverageCategory,
      sugarGramsPer100mlReady: sugarPer100ml,
      containsAddedSugarOrSweetener: false,
      artificialSweetenersOnly: sugarPer100ml === 0,
      dairyPercentage: beverageCategory === 'milk_dairy_75plus' ? 80 : 0,
      excisePricePerLitreAed: nonNegative(priceNum),
    });

    const isExempt = implied.tier === 'exempt_dairy_or_100_juice';
    const isEnergy = beverageCategory === 'energy_drink';

    let appliedTier: SugarTier = implied.tier;
    let appliedRateAedPerL = implied.rateAedPerL;
    let overpaymentRiskAed = 0;

    if (!isExempt && !isEnergy && !moIatCertified) {
      missingLabCount += 1;
      appliedTier = 'high_109_aed_per_l';
      appliedRateAedPerL = HIGH_TIER_RATE_AED_PER_L;
      overpaymentRiskAed = roundAed(
        Math.max(0, appliedRateAedPerL - implied.rateAedPerL) * reconstitutedLitres,
      );
      issues.push('Missing MoIAT lab cert forces 1.09 AED/L default.');
    }

    const estimatedExciseAed = roundAed(reconstitutedLitres * appliedRateAedPerL);
    totalReconstitutedLitres = roundAed(totalReconstitutedLitres + reconstitutedLitres);
    totalExciseLiabilityAed = roundAed(totalExciseLiabilityAed + estimatedExciseAed);
    totalMoIatOverpaymentRiskAed = roundAed(totalMoIatOverpaymentRiskAed + overpaymentRiskAed);

    let status: ReadinessStatus;
    if (!moIatCertified && !isExempt && !isEnergy) {
      status = 'blocked';
      blockedCount += 1;
    } else if (rowSanitized || issues.length > 0) {
      status = 'conditional';
      conditionalCount += 1;
    } else {
      status = 'ready';
      readyCount += 1;
    }

    rows.push({
      rowNumber,
      skuCode,
      productName,
      beverageCategory,
      productFormat,
      sugarPer100ml,
      reconstitutedLitres,
      moIatCertified,
      appliedTier,
      appliedRateAedPerL,
      estimatedExciseAed,
      overpaymentRiskAed,
      status,
      issues,
    });
  }

  return {
    totalRows: rows.length,
    readyCount,
    conditionalCount,
    blockedCount,
    totalReconstitutedLitres,
    totalExciseLiabilityAed,
    totalMoIatOverpaymentRiskAed,
    missingLabCount,
    formulaSanitizedCount,
    rows,
    parseErrors,
  };
}

export function exportSkuAuditCsv(summary: SkuCsvAuditSummary): string {
  const headers = [
    'sku_code',
    'product_name',
    'beverage_category',
    'product_format',
    'sugar_g_per_100ml',
    'reconstituted_litres',
    'moiat_certified',
    'applied_tier',
    'applied_rate_aed_per_l',
    'estimated_excise_aed',
    'overpayment_risk_aed',
    'status',
    'issues',
  ];

  const lines = [headers.join(',')];
  for (const row of summary.rows) {
    lines.push(
      [
        formatCsvField(row.skuCode),
        formatCsvField(row.productName),
        formatCsvField(row.beverageCategory),
        formatCsvField(row.productFormat),
        row.sugarPer100ml.toFixed(2),
        row.reconstitutedLitres.toFixed(2),
        String(row.moIatCertified),
        formatCsvField(row.appliedTier),
        row.appliedRateAedPerL.toFixed(2),
        row.estimatedExciseAed.toFixed(2),
        row.overpaymentRiskAed.toFixed(2),
        formatCsvField(row.status),
        formatCsvField(row.issues.join('; ')),
      ].join(','),
    );
  }

  return `\uFEFF${lines.join('\r\n')}`;
}
