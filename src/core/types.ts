export type BeverageCategory =
  | 'sweetened_beverage'
  | 'energy_drink'
  | 'milk_dairy_75plus'
  | 'natural_juice_100pct';

export type ProductFormat =
  | 'ready_to_drink'
  | 'liquid_concentrate'
  | 'powder_sachet'
  | 'gel_extract';

export type SugarTier =
  | 'high_109_aed_per_l'
  | 'moderate_079_aed_per_l'
  | 'low_or_artificial_zero_aed_per_l'
  | 'energy_drink_100pct'
  | 'exempt_dairy_or_100_juice';

export type ReadinessStatus = 'ready' | 'conditional' | 'blocked';
export type SeverityLevel = 'blocker' | 'warning' | 'info';

export type SugarControlId =
  | 'SUG-CTRL-01'
  | 'SUG-CTRL-02'
  | 'SUG-CTRL-03'
  | 'SUG-CTRL-04'
  | 'SUG-CTRL-05'
  | 'SUG-CTRL-06';

export interface SugarControlSpec {
  id: SugarControlId;
  weight: number;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

export interface AssessmentInput {
  organizationName: string;
  trnNumber: string;
  taxPeriodEndDate: string;
  productName: string;
  beverageCategory: BeverageCategory;
  productFormat: ProductFormat;
  sugarGramsPer100mlReady: number;
  containsAddedSugarOrSweetener: boolean;
  artificialSweetenersOnly: boolean;
  dairyPercentage: number;
  baseUnitsOrLitres: number;
  reconstitutionRatioLitresPerUnit: number;
  retailOrExcisePricePerLitreAed: number;
  hasMoIatAccreditedLabReport: boolean;
  hasMoIatConformityCert: boolean;
  dilutionGuidelinesVerified: boolean;
  registeredOnEmaraTax: boolean;
  lateMonthsUnderAudit: number;
  repeatDocViolationWithin24m: boolean;
  targetReformulatedSugarPer100ml: number;
  skuCsv?: string;
  implementedControls: readonly SugarControlId[];
  notes?: string;
}

export interface FindingItem {
  code: string;
  severity: SeverityLevel;
  titleEn: string;
  titleAr: string;
  detailEn: string;
  detailAr: string;
  legalRef: string;
}

export interface TierAndRateResult {
  emaraTaxReturnDueDate: string;
  reconstitutedLitres: number;
  recipeImpliedTier: SugarTier;
  appliedTier: SugarTier;
  recipeImpliedRateAedPerL: number;
  appliedRateAedPerL: number;
  moIatDefaultPenaltyActive: boolean;
  moIatMissingOverpaymentAed: number;
  legacy50PctExciseAed: number;
  volumetricExcise2026Aed: number;
  reformulatedTier: SugarTier;
  reformulatedRateAedPerL: number;
  reformulationAnnualSavingsAed: number;
}

export interface PenaltyAndExposureResult {
  baseExciseLiabilityAed: number;
  moIatOverpaymentPenaltyAed: number;
  latePaymentInterest14PctAed: number;
  docRecordPenaltyAed: number;
  totalFinancialExposureAed: number;
}

export interface SkuCsvRowAudit {
  rowNumber: number;
  skuCode: string;
  productName: string;
  beverageCategory: BeverageCategory;
  productFormat: ProductFormat;
  sugarPer100ml: number;
  reconstitutedLitres: number;
  moIatCertified: boolean;
  appliedTier: SugarTier;
  appliedRateAedPerL: number;
  estimatedExciseAed: number;
  overpaymentRiskAed: number;
  status: ReadinessStatus;
  issues: string[];
}

export interface SkuCsvAuditSummary {
  totalRows: number;
  readyCount: number;
  conditionalCount: number;
  blockedCount: number;
  totalReconstitutedLitres: number;
  totalExciseLiabilityAed: number;
  totalMoIatOverpaymentRiskAed: number;
  missingLabCount: number;
  formulaSanitizedCount: number;
  rows: SkuCsvRowAudit[];
  parseErrors: string[];
}

export interface AssessmentResult {
  toolName: 'SugarTaxAE';
  version: string;
  legalDisclaimerEn: string;
  legalDisclaimerAr: string;
  organizationName: string;
  trnNumber: string;
  taxPeriodEndDate: string;
  tierEval: TierAndRateResult;
  exposure: PenaltyAndExposureResult;
  csvAudit: SkuCsvAuditSummary | null;
  status: ReadinessStatus;
  readinessScore: number;
  activeGapCount: number;
  controls: Array<{
    id: SugarControlId;
    titleEn: string;
    titleAr: string;
    implemented: boolean;
    weight: number;
  }>;
  findings: FindingItem[];
  canonicalDossierText: string;
  dossierSha256: string;
}

export interface SugarTaxPreset {
  id: string;
  labelEn: string;
  labelAr: string;
  descriptionEn: string;
  descriptionAr: string;
  input: AssessmentInput;
}
