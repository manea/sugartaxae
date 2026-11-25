export { buildSugarBriefMarkdown } from './briefBuilder.ts';
export { canonicalizeDossierPayload, computeDossierSha256, computePayloadDigest } from './dossierDigest.ts';
export { evaluatePenaltyAndExposure } from './penaltyAndDeadlineEngine.ts';
export { SUGAR_PRESETS } from './presets.ts';
export { assessSugarTaxReadiness, evaluateSugarTaxCoreSync } from './readinessAssessor.ts';
export { auditSkuCsv, exportSkuAuditCsv, needsCsvFormulaSanitization, sanitizeCsvCell } from './skuCsvAuditor.ts';
export {
  CD75_DOC_PENALTY_FIRST_AED,
  CD75_DOC_PENALTY_REPEAT_24M_AED,
  EMARATAX_EXCISE_DUE_DAY,
  ENERGY_DRINK_EXCISE_PCT,
  HIGH_SUGAR_THRESHOLD_G_PER_100ML,
  HIGH_TIER_RATE_AED_PER_L,
  LATE_PAYMENT_INTEREST_ANNUAL_PCT,
  LEGACY_SWEETENED_EXCISE_PCT,
  LEGAL_DISCLAIMER_AR,
  LEGAL_DISCLAIMER_EN,
  LOW_TIER_RATE_AED_PER_L,
  MILK_EXEMPTION_MIN_PCT,
  MODERATE_SUGAR_THRESHOLD_G_PER_100ML,
  MODERATE_TIER_RATE_AED_PER_L,
  SUGARTAXAE_TOOL_VERSION,
  SUGAR_CONTROLS,
} from './sugarTaxCatalog.ts';
export {
  classifySugarTier,
  computeEmaraTaxReturnDueDate,
  evaluateTierAndRates,
  nonNegative,
  roundAed,
} from './tierAndRateEngine.ts';
export type {
  AssessmentInput,
  AssessmentResult,
  BeverageCategory,
  FindingItem,
  PenaltyAndExposureResult,
  ProductFormat,
  ReadinessStatus,
  SeverityLevel,
  SkuCsvAuditSummary,
  SkuCsvRowAudit,
  SugarControlId,
  SugarControlSpec,
  SugarTaxPreset,
  SugarTier,
  TierAndRateResult,
} from './types.ts';
