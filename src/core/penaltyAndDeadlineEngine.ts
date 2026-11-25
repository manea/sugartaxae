import {
  CD75_DOC_PENALTY_FIRST_AED,
  CD75_DOC_PENALTY_REPEAT_24M_AED,
  LATE_PAYMENT_INTEREST_ANNUAL_PCT,
} from './sugarTaxCatalog.ts';
import { nonNegative, roundAed } from './tierAndRateEngine.ts';
import type {
  AssessmentInput,
  FindingItem,
  PenaltyAndExposureResult,
  TierAndRateResult,
} from './types.ts';

export function evaluatePenaltyAndExposure(
  input: AssessmentInput,
  tierEval: TierAndRateResult,
): {
  exposure: PenaltyAndExposureResult;
  findings: FindingItem[];
} {
  const findings: FindingItem[] = [];

  const baseExciseLiabilityAed = tierEval.volumetricExcise2026Aed;
  const moIatOverpaymentPenaltyAed = tierEval.moIatMissingOverpaymentAed;

  const lateMonths = nonNegative(input.lateMonthsUnderAudit);
  const latePaymentInterest14PctAed = roundAed(
    baseExciseLiabilityAed * (LATE_PAYMENT_INTEREST_ANNUAL_PCT / 100) * (lateMonths / 12),
  );

  const implemented = new Set(input.implementedControls);
  const needsDilution = input.productFormat !== 'ready_to_drink';
  const docGapActive =
    !input.hasMoIatAccreditedLabReport ||
    !input.hasMoIatConformityCert ||
    !input.registeredOnEmaraTax ||
    (needsDilution && !input.dilutionGuidelinesVerified) ||
    !implemented.has('SUG-CTRL-06');

  const docRecordPenaltyAed = docGapActive
    ? input.repeatDocViolationWithin24m
      ? CD75_DOC_PENALTY_REPEAT_24M_AED
      : CD75_DOC_PENALTY_FIRST_AED
    : 0;

  const totalFinancialExposureAed = roundAed(
    moIatOverpaymentPenaltyAed + latePaymentInterest14PctAed + docRecordPenaltyAed,
  );

  if (totalFinancialExposureAed > 0) {
    findings.push({
      code: 'SUG_EXPOSURE_ESTIMATE',
      severity: moIatOverpaymentPenaltyAed > 0 || docRecordPenaltyAed > 0 ? 'warning' : 'info',
      titleEn: `Estimated Avoidable Excise Overpayment & Penalty Exposure: AED ${totalFinancialExposureAed.toLocaleString('en-US')}`,
      titleAr: `التعرض التقديري للفائض والغرامات القابلة للتفادي: ${totalFinancialExposureAed.toLocaleString('en-US')} د.إ`,
      detailEn: `Combines AED ${moIatOverpaymentPenaltyAed.toLocaleString('en-US')} forced 1.09/L missing-lab overpayment, AED ${latePaymentInterest14PctAed.toLocaleString('en-US')} late payment interest (14% p.a.), and AED ${docRecordPenaltyAed.toLocaleString('en-US')} recordkeeping fine.`,
      detailAr: `يشمل فائض التصنيف القسري 1.09 د.إ/لتر (${moIatOverpaymentPenaltyAed.toLocaleString('en-US')} د.إ)، وفائدة التأخير 14% سنوياً (${latePaymentInterest14PctAed.toLocaleString('en-US')} د.إ)، وغرامة السجلات (${docRecordPenaltyAed.toLocaleString('en-US')} د.إ).`,
      legalRef: 'UAE Cabinet Decision No. 197 of 2025, FTA 10/2025 & CD 75/2023 Framework',
    });
  }

  return {
    exposure: {
      baseExciseLiabilityAed,
      moIatOverpaymentPenaltyAed,
      latePaymentInterest14PctAed,
      docRecordPenaltyAed,
      totalFinancialExposureAed,
    },
    findings,
  };
}
