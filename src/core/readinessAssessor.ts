import { canonicalizeDossierPayload, computePayloadDigest } from './dossierDigest.ts';
import { evaluatePenaltyAndExposure } from './penaltyAndDeadlineEngine.ts';
import { auditSkuCsv } from './skuCsvAuditor.ts';
import {
  LEGAL_DISCLAIMER_AR,
  LEGAL_DISCLAIMER_EN,
  SUGARTAXAE_TOOL_VERSION,
  SUGAR_CONTROLS,
} from './sugarTaxCatalog.ts';
import { evaluateTierAndRates } from './tierAndRateEngine.ts';
import type { AssessmentInput, AssessmentResult, FindingItem, ReadinessStatus } from './types.ts';

export function evaluateSugarTaxCoreSync(input: AssessmentInput): AssessmentResult {
  const { tierEval, findings: tierFindings } = evaluateTierAndRates(input);
  const { exposure, findings: penaltyFindings } = evaluatePenaltyAndExposure(input, tierEval);

  const hasCsv = typeof input.skuCsv === 'string' && input.skuCsv.trim().length > 0;
  const csvAudit = hasCsv ? auditSkuCsv(input.skuCsv!) : null;

  const findings: FindingItem[] = [...tierFindings, ...penaltyFindings];

  if (csvAudit) {
    if (csvAudit.parseErrors.length > 0) {
      findings.push({
        code: 'SUG_CSV_PARSE_ERRORS',
        severity: 'blocker',
        titleEn: `SKU CSV Contains ${csvAudit.parseErrors.length} Parse Error(s)`,
        titleAr: `يحتوي كشف الأصناف CSV على ${csvAudit.parseErrors.length} أخطاء تحليل`,
        detailEn: csvAudit.parseErrors.join(' '),
        detailAr: csvAudit.parseErrors.join(' '),
        legalRef: 'EmaraTax Excise Product Upload Integrity',
      });
    }
    if (csvAudit.formulaSanitizedCount > 0) {
      findings.push({
        code: 'SUG_CSV_FORMULA_NEUTRALIZED',
        severity: 'warning',
        titleEn: `CWE-1236 Formula Injection Neutralized (${csvAudit.formulaSanitizedCount} cell(s))`,
        titleAr: `تحييد ${csvAudit.formulaSanitizedCount} خلية حقن صيغ خطرة (CWE-1236)`,
        detailEn: 'Spreadsheet formula prefixes (=, +, -, @, tab, CR) were neutralized safely.',
        detailAr: 'تم تحييد محارف بدايات الصيغ الجدولية الخطرة لمنع تنفيذ الأوامر عند التصدير.',
        legalRef: 'OWASP CWE-1236 Safe CSV Export',
      });
    }
    if (csvAudit.blockedCount > 0) {
      findings.push({
        code: 'SUG_CSV_MISSING_MOIAT_LAB',
        severity: 'blocker',
        titleEn: `${csvAudit.blockedCount} CSV Beverage SKU(s) Missing MoIAT Lab Certificate`,
        titleAr: `${csvAudit.blockedCount} صنف/أصناف في كشف CSV تفتقر لشهادة مختبر MoIAT`,
        detailEn: `Default 1.09 AED/L tier adds AED ${csvAudit.totalMoIatOverpaymentRiskAed.toLocaleString('en-US')} overpayment risk across the batch.`,
        detailAr: `يفرض السقوط الافتراضي 1.09 د.إ/لتر مخاطر فائض بقيمة ${csvAudit.totalMoIatOverpaymentRiskAed.toLocaleString('en-US')} د.إ عبر الدفعة.`,
        legalRef: 'Cabinet Decision No. 197 of 2025 & FTA 10/2025',
      });
    }
  }

  const implementedSet = new Set(input.implementedControls);
  const controls = SUGAR_CONTROLS.map((ctrl) => {
    const implemented = implementedSet.has(ctrl.id);
    if (!implemented) {
      findings.push({
        code: `SUG_CONTROL_GAP_${ctrl.id.replace(/-/g, '_')}`,
        severity: 'warning',
        titleEn: `Missing Control ${ctrl.id}: ${ctrl.titleEn}`,
        titleAr: `ضابط ناقص ${ctrl.id}: ${ctrl.titleAr}`,
        detailEn: ctrl.descriptionEn,
        detailAr: ctrl.descriptionAr,
        legalRef: `SugarTaxAE Control ${ctrl.id}`,
      });
    }
    return {
      id: ctrl.id,
      titleEn: ctrl.titleEn,
      titleAr: ctrl.titleAr,
      implemented,
      weight: ctrl.weight,
    };
  });

  const readinessScore = controls.reduce(
    (sum, ctrl) => sum + (ctrl.implemented ? ctrl.weight : 0),
    0,
  );

  const hasBlockers = findings.some((f) => f.severity === 'blocker');
  const hasWarnings = findings.some((f) => f.severity === 'warning');
  const activeGapCount = findings.filter(
    (f) => f.severity === 'blocker' || f.severity === 'warning',
  ).length;

  let status: ReadinessStatus;
  if (hasBlockers || readinessScore < 50) {
    status = 'blocked';
  } else if (hasWarnings || readinessScore < 100) {
    status = 'conditional';
  } else {
    status = 'ready';
  }

  const canonicalPayload = {
    toolName: 'SugarTaxAE' as const,
    version: SUGARTAXAE_TOOL_VERSION,
    organizationName: input.organizationName.trim(),
    trnNumber: input.trnNumber.trim(),
    taxPeriodEndDate: input.taxPeriodEndDate.trim(),
    productName: input.productName.trim(),
    beverageCategory: input.beverageCategory,
    productFormat: input.productFormat,
    tierEval,
    exposure,
    csvAudit,
    status,
    readinessScore,
    activeGapCount,
    controls,
    findings,
  };

  return {
    toolName: 'SugarTaxAE',
    version: SUGARTAXAE_TOOL_VERSION,
    legalDisclaimerEn: LEGAL_DISCLAIMER_EN,
    legalDisclaimerAr: LEGAL_DISCLAIMER_AR,
    organizationName: input.organizationName.trim(),
    trnNumber: input.trnNumber.trim(),
    taxPeriodEndDate: input.taxPeriodEndDate.trim(),
    tierEval,
    exposure,
    csvAudit,
    status,
    readinessScore,
    activeGapCount,
    controls,
    findings,
    canonicalDossierText: canonicalizeDossierPayload(canonicalPayload),
    dossierSha256: '',
  };
}

export async function assessSugarTaxReadiness(input: AssessmentInput): Promise<AssessmentResult> {
  const base = evaluateSugarTaxCoreSync(input);
  const dossierSha256 = await computePayloadDigest(base.canonicalDossierText);
  return {
    ...base,
    dossierSha256,
  };
}
