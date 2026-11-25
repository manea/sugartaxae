import {
  EMARATAX_EXCISE_DUE_DAY,
  ENERGY_DRINK_EXCISE_PCT,
  HIGH_SUGAR_THRESHOLD_G_PER_100ML,
  HIGH_TIER_RATE_AED_PER_L,
  LEGACY_SWEETENED_EXCISE_PCT,
  LOW_TIER_RATE_AED_PER_L,
  MILK_EXEMPTION_MIN_PCT,
  MODERATE_SUGAR_THRESHOLD_G_PER_100ML,
  MODERATE_TIER_RATE_AED_PER_L,
} from './sugarTaxCatalog.ts';
import type {
  AssessmentInput,
  BeverageCategory,
  FindingItem,
  SugarTier,
  TierAndRateResult,
} from './types.ts';

export function roundAed(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function nonNegative(value: number): number {
  return Math.max(0, roundAed(value));
}

export function computeEmaraTaxReturnDueDate(taxPeriodEndDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(taxPeriodEndDate.trim());
  if (!match) {
    return '';
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return '';
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return '';
  }

  const totalMonths = year * 12 + (month - 1) + 1;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthZeroBased = totalMonths % 12;

  return `${String(targetYear).padStart(4, '0')}-${String(targetMonthZeroBased + 1).padStart(2, '0')}-${String(EMARATAX_EXCISE_DUE_DAY).padStart(2, '0')}`;
}

export function classifySugarTier(params: {
  beverageCategory: BeverageCategory;
  sugarGramsPer100mlReady: number;
  containsAddedSugarOrSweetener: boolean;
  artificialSweetenersOnly: boolean;
  dairyPercentage: number;
  excisePricePerLitreAed: number;
}): { tier: SugarTier; rateAedPerL: number } {
  const {
    beverageCategory,
    sugarGramsPer100mlReady,
    containsAddedSugarOrSweetener,
    artificialSweetenersOnly,
    dairyPercentage,
    excisePricePerLitreAed,
  } = params;

  if (beverageCategory === 'energy_drink') {
    return {
      tier: 'energy_drink_100pct',
      rateAedPerL: roundAed(nonNegative(excisePricePerLitreAed) * (ENERGY_DRINK_EXCISE_PCT / 100)),
    };
  }

  if (
    beverageCategory === 'milk_dairy_75plus' &&
    nonNegative(dairyPercentage) >= MILK_EXEMPTION_MIN_PCT
  ) {
    return { tier: 'exempt_dairy_or_100_juice', rateAedPerL: LOW_TIER_RATE_AED_PER_L };
  }

  if (beverageCategory === 'natural_juice_100pct' && !containsAddedSugarOrSweetener) {
    return { tier: 'exempt_dairy_or_100_juice', rateAedPerL: LOW_TIER_RATE_AED_PER_L };
  }

  const sugar = nonNegative(sugarGramsPer100mlReady);
  if (artificialSweetenersOnly && sugar < MODERATE_SUGAR_THRESHOLD_G_PER_100ML) {
    return {
      tier: 'low_or_artificial_zero_aed_per_l',
      rateAedPerL: LOW_TIER_RATE_AED_PER_L,
    };
  }

  if (sugar >= HIGH_SUGAR_THRESHOLD_G_PER_100ML) {
    return { tier: 'high_109_aed_per_l', rateAedPerL: HIGH_TIER_RATE_AED_PER_L };
  }
  if (sugar >= MODERATE_SUGAR_THRESHOLD_G_PER_100ML) {
    return { tier: 'moderate_079_aed_per_l', rateAedPerL: MODERATE_TIER_RATE_AED_PER_L };
  }
  return {
    tier: 'low_or_artificial_zero_aed_per_l',
    rateAedPerL: LOW_TIER_RATE_AED_PER_L,
  };
}

export function evaluateTierAndRates(input: AssessmentInput): {
  tierEval: TierAndRateResult;
  findings: FindingItem[];
} {
  const findings: FindingItem[] = [];
  const emaraTaxReturnDueDate = computeEmaraTaxReturnDueDate(input.taxPeriodEndDate);

  if (!emaraTaxReturnDueDate) {
    findings.push({
      code: 'SUG_INVALID_PERIOD_END',
      severity: 'blocker',
      titleEn: 'Invalid Excise Tax Period End Date',
      titleAr: 'تاريخ نهاية الفترة الضريبية غير صالح',
      detailEn:
        'Provide a valid ISO calendar date (YYYY-MM-DD) to compute the EmaraTax EX201 filing due date (15th of the following month).',
      detailAr:
        'أدخل تاريخاً ميلادياً صحيحاً (YYYY-MM-DD) لحساب موعد تقديم إقرار EX201 باليوم 15 من الشهر التالي.',
      legalRef: 'UAE Federal Decree-Law No. 7 of 2017 on Excise Tax — Monthly EX201 SLA',
    });
  }

  const baseUnits = nonNegative(input.baseUnitsOrLitres);
  const ratio =
    input.productFormat === 'ready_to_drink'
      ? 1
      : Math.max(0.01, nonNegative(input.reconstitutionRatioLitresPerUnit) || 1);
  const reconstitutedLitres = roundAed(baseUnits * ratio);

  const recipe = classifySugarTier({
    beverageCategory: input.beverageCategory,
    sugarGramsPer100mlReady: input.sugarGramsPer100mlReady,
    containsAddedSugarOrSweetener: input.containsAddedSugarOrSweetener,
    artificialSweetenersOnly: input.artificialSweetenersOnly,
    dairyPercentage: input.dairyPercentage,
    excisePricePerLitreAed: input.retailOrExcisePricePerLitreAed,
  });

  const isExempt = recipe.tier === 'exempt_dairy_or_100_juice';
  const isEnergy = input.beverageCategory === 'energy_drink';
  const needsDilutionCheck = input.productFormat !== 'ready_to_drink';
  const missingLabOrCert = !input.hasMoIatAccreditedLabReport || !input.hasMoIatConformityCert;
  const missingDilution = needsDilutionCheck && !input.dilutionGuidelinesVerified;

  let appliedTier: SugarTier = recipe.tier;
  let appliedRateAedPerL = recipe.rateAedPerL;
  let moIatDefaultPenaltyActive = false;

  if (!isExempt && !isEnergy && (missingLabOrCert || missingDilution)) {
    moIatDefaultPenaltyActive = true;
    appliedTier = 'high_109_aed_per_l';
    appliedRateAedPerL = HIGH_TIER_RATE_AED_PER_L;
  }

  const volumetricExcise2026Aed = roundAed(reconstitutedLitres * appliedRateAedPerL);
  const moIatMissingOverpaymentAed = moIatDefaultPenaltyActive
    ? roundAed(Math.max(0, appliedRateAedPerL - recipe.rateAedPerL) * reconstitutedLitres)
    : 0;

  const legacy50PctExciseAed = isEnergy
    ? volumetricExcise2026Aed
    : isExempt
      ? 0
      : roundAed(
          reconstitutedLitres *
            nonNegative(input.retailOrExcisePricePerLitreAed) *
            (LEGACY_SWEETENED_EXCISE_PCT / 100),
        );

  const reformulated = isEnergy
    ? recipe
    : classifySugarTier({
        beverageCategory: input.beverageCategory,
        sugarGramsPer100mlReady: input.targetReformulatedSugarPer100ml,
        containsAddedSugarOrSweetener: input.containsAddedSugarOrSweetener,
        artificialSweetenersOnly:
          input.artificialSweetenersOnly ||
          nonNegative(input.targetReformulatedSugarPer100ml) === 0,
        dairyPercentage: input.dairyPercentage,
        excisePricePerLitreAed: input.retailOrExcisePricePerLitreAed,
      });

  const reformulationAnnualSavingsAed = isEnergy
    ? 0
    : roundAed(Math.max(0, appliedRateAedPerL - reformulated.rateAedPerL) * reconstitutedLitres);

  if (moIatDefaultPenaltyActive) {
    findings.push({
      code: 'SUG_MOIAT_MISSING_DEFAULT_109',
      severity: 'blocker',
      titleEn: 'Missing MoIAT / ISO 17025 Verification Forces AED 1.09/L High-Tier Default',
      titleAr: 'غياب شهادة المختبر أو المطابقة MoIAT يفرض التصنيف القسري 1.09 د.إ/لتر',
      detailEn: `Because accredited lab report, MoIAT ECAS certificate, or concentrate dilution sheet is missing, FTA defaults all ${reconstitutedLitres.toLocaleString('en-US')}L to AED 1.09/L (excess overpayment AED ${moIatMissingOverpaymentAed.toLocaleString('en-US')}).`,
      detailAr: `بسبب غياب التقرير المخبري المعتمد أو شهادة MoIAT أو جدول التخفيف، تُصنّف الكمية (${reconstitutedLitres.toLocaleString('en-US')} لتر) تلقائياً بأعلى شريحة 1.09 د.إ/لتر بفائض سداد ${moIatMissingOverpaymentAed.toLocaleString('en-US')} د.إ.`,
      legalRef: 'UAE Cabinet Decision No. 197 of 2025 & FTA Decision No. 10 of 2025',
    });
  }

  if (input.beverageCategory === 'milk_dairy_75plus' && nonNegative(input.dairyPercentage) < MILK_EXEMPTION_MIN_PCT) {
    findings.push({
      code: 'SUG_DAIRY_BELOW_75_TAXABLE',
      severity: 'warning',
      titleEn: 'Dairy Content Below 75% Loses Excise Exemption',
      titleAr: 'انخفاض نسبة الحليب عن 75% يُفقد المشروب الإعفاء الانتقائي',
      detailEn: `Dairy share (${input.dairyPercentage}%) is below the 75% statutory floor; beverage is taxed on total sugar/sweetener tier.`,
      detailAr: `نسبة الحليب المدخلة (${input.dairyPercentage}%) أقل من عتبة الـ 75% النظامية، فيخضع المشروب لشرائح السكر المتدرجة.`,
      legalRef: 'UAE Cabinet Decision No. 197 of 2025 — Dairy Exemption Threshold (>= 75%)',
    });
  }

  if (input.beverageCategory === 'natural_juice_100pct' && input.containsAddedSugarOrSweetener) {
    findings.push({
      code: 'SUG_JUICE_WITH_ADDED_SWEETENER',
      severity: 'warning',
      titleEn: 'Juice Contains Added Sugar/Sweeteners — Excluded from 100% Natural Exemption',
      titleAr: 'عصير يحوي سكراً مضافاً أو محليات يفقد استثناء العصير الطبيعي 100%',
      detailEn:
        'Only 100% natural juices free from any added sugar or sweeteners remain exempt; added sweeteners bring the drink into sugar-tier scope.',
      detailAr:
        'تُعفى فقط العصائر الطبيعية الخالية تماماً من السكر المضاف أو المحليات الصناعية، وأي إضافة تُخضع المنتج للشرائح الحجمية.',
      legalRef: 'UAE Cabinet Decision No. 197 of 2025 — Natural Juice Boundary',
    });
  }

  if (!input.registeredOnEmaraTax) {
    findings.push({
      code: 'SUG_UNREGISTERED_EMARATAX_SKU',
      severity: 'blocker',
      titleEn: 'Product SKU Not Registered on EmaraTax Excise Portal',
      titleAr: 'الصنف غير مسجل في منصة EmaraTax للضريبة الانتقائية',
      detailEn: 'Register all excisable beverages and MoIAT lab reports on EmaraTax before release/import.',
      detailAr: 'يجب تسجيل المشروبات الخاضعة وإرفاق شهادات المختبر في بوابة EmaraTax قبل الفسح الجمركي أو التداول.',
      legalRef: 'UAE Excise Tax Registration & FTA Decision No. 10 of 2025',
    });
  }

  if (isEnergy) {
    findings.push({
      code: 'SUG_ENERGY_DRINK_100PCT',
      severity: 'info',
      titleEn: 'Energy Drink Classified Under Dedicated 100% Excise Rate',
      titleAr: 'تصنيف مشروب الطاقة ضمن النسبة الثابتة 100%',
      detailEn: 'Energy drinks remain subject to the 100% excise rate and fall outside the 1.09 / 0.79 / 0 AED/L sugar tiers.',
      detailAr: 'تبقى مشروبات الطاقة خاضعة لضريبة 100% وتُستثنى من شرائح السكر المتدرجة.',
      legalRef: 'UAE Cabinet Decision No. 197 of 2025',
    });
  }

  if (
    input.beverageCategory === 'sweetened_beverage' &&
    input.artificialSweetenersOnly &&
    nonNegative(input.sugarGramsPer100mlReady) >= MODERATE_SUGAR_THRESHOLD_G_PER_100ML
  ) {
    findings.push({
      code: 'SUG_ARTIFICIAL_DOES_NOT_OFFSET_SUGAR',
      severity: 'warning',
      titleEn: 'Artificial Sweeteners Do Not Offset Real Sugar Above 5g/100ml',
      titleAr: 'المحليات الصناعية لا تعادل أو تخفض السكر الحقيقي فوق 5غ/100مل',
      detailEn:
        'Only beverages sweetened solely by artificial sweeteners (< 5g sugar) qualify for AED 0/L; mixed formulas are taxed on total sugar.',
      detailAr:
        'يعفى فقط المشروب المحلى صناعياً بالكامل (< 5غ سكر)، وعند الخلط بالسكر يُحسب إجمالي السكر لتحديد الشريحة.',
      legalRef: 'UAE Cabinet Decision No. 197 of 2025 & FTA 2026 Guidelines',
    });
  }

  return {
    tierEval: {
      emaraTaxReturnDueDate,
      reconstitutedLitres,
      recipeImpliedTier: recipe.tier,
      appliedTier,
      recipeImpliedRateAedPerL: recipe.rateAedPerL,
      appliedRateAedPerL,
      moIatDefaultPenaltyActive,
      moIatMissingOverpaymentAed,
      legacy50PctExciseAed,
      volumetricExcise2026Aed,
      reformulatedTier: reformulated.tier,
      reformulatedRateAedPerL: reformulated.rateAedPerL,
      reformulationAnnualSavingsAed,
    },
    findings,
  };
}
