import { describe, expect, it } from 'vitest';
import {
  CD75_DOC_PENALTY_FIRST_AED,
  CD75_DOC_PENALTY_REPEAT_24M_AED,
  HIGH_TIER_RATE_AED_PER_L,
  LOW_TIER_RATE_AED_PER_L,
  MODERATE_TIER_RATE_AED_PER_L,
  SUGAR_PRESETS,
  assessSugarTaxReadiness,
  auditSkuCsv,
  classifySugarTier,
  computeEmaraTaxReturnDueDate,
  exportSkuAuditCsv,
  sanitizeCsvCell,
} from '../../src/core/index.ts';
import type { AssessmentInput } from '../../src/core/index.ts';

function clonePreset(index: number): AssessmentInput {
  return structuredClone(SUGAR_PRESETS[index]!.input) as AssessmentInput;
}

describe('SugarTaxAE UAE Cabinet Decision 197/2025 Core', () => {
  it('evaluates the 3 canonical UAE beverage presets cleanly', async () => {
    const ready = await assessSugarTaxReadiness(clonePreset(0));
    expect(ready.status).toBe('ready');
    expect(ready.readinessScore).toBe(100);
    expect(ready.tierEval.emaraTaxReturnDueDate).toBe('2026-02-15');
    expect(ready.tierEval.appliedRateAedPerL).toBe(0);
    expect(ready.tierEval.volumetricExcise2026Aed).toBe(0);
    expect(ready.exposure.totalFinancialExposureAed).toBe(0);

    const conditional = await assessSugarTaxReadiness(clonePreset(1));
    expect(conditional.status).toBe('conditional');
    expect(conditional.readinessScore).toBe(85);
    expect(conditional.tierEval.appliedTier).toBe('moderate_079_aed_per_l');
    expect(conditional.tierEval.appliedRateAedPerL).toBe(MODERATE_TIER_RATE_AED_PER_L);
    expect(conditional.tierEval.volumetricExcise2026Aed).toBe(158_000);
    expect(conditional.tierEval.reformulationAnnualSavingsAed).toBe(158_000);
    expect(conditional.exposure.docRecordPenaltyAed).toBe(CD75_DOC_PENALTY_FIRST_AED);

    const blocked = await assessSugarTaxReadiness(clonePreset(2));
    expect(blocked.status).toBe('blocked');
    expect(blocked.readinessScore).toBe(0);
    expect(blocked.tierEval.emaraTaxReturnDueDate).toBe('2027-01-15');
    expect(blocked.tierEval.reconstitutedLitres).toBe(50_000);
    expect(blocked.tierEval.recipeImpliedTier).toBe('low_or_artificial_zero_aed_per_l');
    expect(blocked.tierEval.moIatDefaultPenaltyActive).toBe(true);
    expect(blocked.tierEval.appliedRateAedPerL).toBe(HIGH_TIER_RATE_AED_PER_L);
    expect(blocked.tierEval.volumetricExcise2026Aed).toBe(54_500);
    expect(blocked.tierEval.moIatMissingOverpaymentAed).toBe(54_500);
    expect(blocked.exposure.docRecordPenaltyAed).toBe(CD75_DOC_PENALTY_REPEAT_24M_AED);
    expect(blocked.csvAudit?.formulaSanitizedCount).toBe(1);
    expect(blocked.csvAudit?.blockedCount).toBe(1);
  });

  it('implements exact CD 197/2025 tiers, 100% energy drinks, 75% dairy & 100% juice boundaries', () => {
    expect(
      classifySugarTier({
        beverageCategory: 'sweetened_beverage',
        sugarGramsPer100mlReady: 8.0,
        containsAddedSugarOrSweetener: true,
        artificialSweetenersOnly: false,
        dairyPercentage: 0,
        excisePricePerLitreAed: 10,
      }).rateAedPerL,
    ).toBe(HIGH_TIER_RATE_AED_PER_L);

    expect(
      classifySugarTier({
        beverageCategory: 'sweetened_beverage',
        sugarGramsPer100mlReady: 7.99,
        containsAddedSugarOrSweetener: true,
        artificialSweetenersOnly: false,
        dairyPercentage: 0,
        excisePricePerLitreAed: 10,
      }).rateAedPerL,
    ).toBe(MODERATE_TIER_RATE_AED_PER_L);

    expect(
      classifySugarTier({
        beverageCategory: 'sweetened_beverage',
        sugarGramsPer100mlReady: 4.99,
        containsAddedSugarOrSweetener: false,
        artificialSweetenersOnly: true,
        dairyPercentage: 0,
        excisePricePerLitreAed: 10,
      }).rateAedPerL,
    ).toBe(LOW_TIER_RATE_AED_PER_L);

    // Artificial sweetener does NOT neutralize real sugar >= 5g
    expect(
      classifySugarTier({
        beverageCategory: 'sweetened_beverage',
        sugarGramsPer100mlReady: 8.5,
        containsAddedSugarOrSweetener: true,
        artificialSweetenersOnly: true,
        dairyPercentage: 0,
        excisePricePerLitreAed: 10,
      }).rateAedPerL,
    ).toBe(HIGH_TIER_RATE_AED_PER_L);

    // Milk >= 75% exempt vs 74% taxable
    expect(
      classifySugarTier({
        beverageCategory: 'milk_dairy_75plus',
        sugarGramsPer100mlReady: 9.0,
        containsAddedSugarOrSweetener: true,
        artificialSweetenersOnly: false,
        dairyPercentage: 75,
        excisePricePerLitreAed: 12,
      }).tier,
    ).toBe('exempt_dairy_or_100_juice');

    expect(
      classifySugarTier({
        beverageCategory: 'milk_dairy_75plus',
        sugarGramsPer100mlReady: 9.0,
        containsAddedSugarOrSweetener: true,
        artificialSweetenersOnly: false,
        dairyPercentage: 74,
        excisePricePerLitreAed: 12,
      }).rateAedPerL,
    ).toBe(HIGH_TIER_RATE_AED_PER_L);

    // 100% pure natural juice vs juice with added sweeteners
    expect(
      classifySugarTier({
        beverageCategory: 'natural_juice_100pct',
        sugarGramsPer100mlReady: 10.5,
        containsAddedSugarOrSweetener: false,
        artificialSweetenersOnly: false,
        dairyPercentage: 0,
        excisePricePerLitreAed: 14,
      }).tier,
    ).toBe('exempt_dairy_or_100_juice');

    expect(
      classifySugarTier({
        beverageCategory: 'natural_juice_100pct',
        sugarGramsPer100mlReady: 10.5,
        containsAddedSugarOrSweetener: true,
        artificialSweetenersOnly: false,
        dairyPercentage: 0,
        excisePricePerLitreAed: 14,
      }).rateAedPerL,
    ).toBe(HIGH_TIER_RATE_AED_PER_L);

    // Energy drink 100%
    const energy = classifySugarTier({
      beverageCategory: 'energy_drink',
      sugarGramsPer100mlReady: 0,
      containsAddedSugarOrSweetener: false,
      artificialSweetenersOnly: true,
      dairyPercentage: 0,
      excisePricePerLitreAed: 14,
    });
    expect(energy.tier).toBe('energy_drink_100pct');
    expect(energy.rateAedPerL).toBe(14);
  });

  it('computes 15th-of-following-month EmaraTax EX201 due dates', () => {
    expect(computeEmaraTaxReturnDueDate('2026-01-31')).toBe('2026-02-15');
    expect(computeEmaraTaxReturnDueDate('2026-12-31')).toBe('2027-01-15');
    expect(computeEmaraTaxReturnDueDate('bad-date')).toBe('');
  });

  it('neutralizes CWE-1236 payloads and exports UTF-8 BOM + CRLF SKU CSV', () => {
    expect(sanitizeCsvCell('=HYPERLINK("http://bad")')).toBe('\'=HYPERLINK("http://bad")');
    const audit = auditSkuCsv(SUGAR_PRESETS[2]!.input.skuCsv!);
    expect(audit.parseErrors).toEqual([]);
    expect(audit.formulaSanitizedCount).toBe(1);
    expect(audit.rows[1]?.productName.startsWith("'=HYPERLINK")).toBe(true);

    const exported = exportSkuAuditCsv(audit);
    expect(exported.startsWith('\uFEFF')).toBe(true);
    expect(exported.includes('\r\n')).toBe(true);
    expect(exported).not.toContain("''=HYPERLINK");
  });

  it('produces deterministic SHA-256 digests and explicit Non-FTA/Non-MoIAT disclaimers', async () => {
    const a = clonePreset(0);
    const b = clonePreset(0);
    b.implementedControls = [...b.implementedControls].reverse();
    const resA = await assessSugarTaxReadiness(a);
    const resB = await assessSugarTaxReadiness(b);

    expect(resA.dossierSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(resA.dossierSha256).toBe(resB.dossierSha256);
    expect(resA.legalDisclaimerEn).toContain('NOT affiliated');
    expect(resA.legalDisclaimerEn).toContain('MoIAT');
    expect(resA.legalDisclaimerAr).toContain('ليست تابعة أو معتمدة');
  });
});
