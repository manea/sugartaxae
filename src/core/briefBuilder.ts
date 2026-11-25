import type {
  AssessmentInput,
  AssessmentResult,
  BeverageCategory,
  ProductFormat,
  SugarTier,
} from './types.ts';

function escMdCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatNum(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : decimals,
    maximumFractionDigits: decimals,
  });
}

const CATEGORY_LABELS: Record<BeverageCategory, { en: string; ar: string }> = {
  sweetened_beverage: {
    en: 'Sweetened Beverage (Tiered Volumetric)',
    ar: 'مشروب محلى (شرائح حجمية متدرجة)',
  },
  energy_drink: {
    en: 'Energy Drink (Flat 100% Excise)',
    ar: 'مشروب طاقة (ضريبة 100% ثابتة)',
  },
  milk_dairy_75plus: {
    en: 'Milk / Dairy Substitute (>= 75% Dairy Exempt)',
    ar: 'حليب / ألبان بديلة (>= 75% معفى)',
  },
  natural_juice_100pct: {
    en: '100% Natural Fruit/Vegetable Juice (Zero Added Sugar/Sweeteners)',
    ar: 'عصير طبيعي 100% (خالي من السكر والمحليات المضافة)',
  },
};

const FORMAT_LABELS: Record<ProductFormat, { en: string; ar: string }> = {
  ready_to_drink: { en: 'Ready-to-Drink (RTD)', ar: 'جاهز للشرب (RTD)' },
  liquid_concentrate: { en: 'Liquid Concentrate / Syrup', ar: 'مركز سائل / شراب مركز' },
  powder_sachet: { en: 'Powder / Sachet Mix', ar: 'مسحوق / أكياس تحضير' },
  gel_extract: { en: 'Gel / Beverage Extract', ar: 'جل / مستخلص مشروبات' },
};

const TIER_LABELS: Record<SugarTier, { en: string; ar: string }> = {
  high_109_aed_per_l: { en: 'High Sugar (>= 8g/100ml) — AED 1.09/L', ar: 'سكر مرتفع (>= 8غ/100مل) — 1.09 د.إ/لتر' },
  moderate_079_aed_per_l: { en: 'Moderate Sugar (5g to <8g/100ml) — AED 0.79/L', ar: 'سكر متوسط (5 إلى <8غ/100مل) — 0.79 د.إ/لتر' },
  low_or_artificial_zero_aed_per_l: {
    en: 'Low Sugar (<5g/100ml) or Artificial Only — AED 0.00/L',
    ar: 'سكر منخفض (<5غ/100مل) أو محليات صناعية فقط — 0 د.إ/لتر',
  },
  energy_drink_100pct: { en: 'Energy Drink — 100% Excise Rate', ar: 'مشروب طاقة — ضريبة 100%' },
  exempt_dairy_or_100_juice: { en: 'Statutory Exemption (>=75% Dairy / 100% Juice)', ar: 'إعفاء نظامي (ألبان >=75% / عصير طبيعي 100%)' },
};

export function buildSugarBriefMarkdown(
  input: AssessmentInput,
  result: AssessmentResult,
  dossierCode: string,
  sha256Digest: string,
  locale: 'en' | 'ar' = 'ar',
): string {
  const digest = sha256Digest || result.dossierSha256;
  const cat = CATEGORY_LABELS[input.beverageCategory] ?? { en: input.beverageCategory, ar: input.beverageCategory };
  const fmt = FORMAT_LABELS[input.productFormat] ?? { en: input.productFormat, ar: input.productFormat };
  const impliedTier = TIER_LABELS[result.tierEval.recipeImpliedTier] ?? {
    en: result.tierEval.recipeImpliedTier,
    ar: result.tierEval.recipeImpliedTier,
  };
  const appliedTier = TIER_LABELS[result.tierEval.appliedTier] ?? {
    en: result.tierEval.appliedTier,
    ar: result.tierEval.appliedTier,
  };
  const refTier = TIER_LABELS[result.tierEval.reformulatedTier] ?? {
    en: result.tierEval.reformulatedTier,
    ar: result.tierEval.reformulatedTier,
  };
  const { tierEval, exposure } = result;

  if (locale === 'ar') {
    const lines: string[] = [
      `# ملف جاهزية ضريبة المشروبات المحلاة المتدرجة الإماراتية — \`${dossierCode}\``,
      '',
      `> **تنويه الاستقلالية وعدم التبعية للجهات الرسمية:** ${result.legalDisclaimerAr}`,
      '',
      '## 1. ملخص المكلف والمنتج وحالة الجاهزية',
      '',
      '| البند | القيمة |',
      '|---|---|',
      `| رمز الملف | \`${escMdCell(dossierCode)}\` |`,
      `| الأداة والإصدار | \`SugarTaxAE v${escMdCell(result.version)}\` |`,
      `| المنشأة | ${escMdCell(input.organizationName)} |`,
      `| الرقم الضريبي \`TRN\` | \`${escMdCell(input.trnNumber)}\` |`,
      `| اسم المنتج | ${escMdCell(input.productName)} |`,
      `| التصنيف / الشكل التجاري | ${cat.ar} — ${fmt.ar} |`,
      `| محتوى السكر الجاهز للشرب | **${formatNum(input.sugarGramsPer100mlReady)} غ/100مل** (محليات فقط: ${input.artificialSweetenersOnly ? 'نعم' : 'لا'}) |`,
      `| نهاية الفترة الضريبية / موعد \`EmaraTax EX201\` (اليوم 15) | \`${escMdCell(input.taxPeriodEndDate)}\` / \`${escMdCell(tierEval.emaraTaxReturnDueDate)}\` |`,
      `| حالة الجاهزية والدرجة | **${result.status.toUpperCase()}** (**${result.readinessScore}/100**) |`,
      `| بصمة التثبيت \`SHA-256\` | \`${escMdCell(digest)}\` |`,
      '',
      '## 2. تصنيف الشرائح الحجمية وفحص مختبر MoIAT (قرار 197/2025)',
      '',
      `- **الحجم النهائي الجاهز للشرب**: **${formatNum(tierEval.reconstitutedLitres)} لتر** (الأساس: ${formatNum(input.baseUnitsOrLitres)} × معامل التخفيف ${formatNum(input.reconstitutionRatioLitresPerUnit)})`,
      `- **الشريحة المحسوبة حسب الوصفة**: ${impliedTier.ar} (\`${formatNum(tierEval.recipeImpliedRateAedPerL)} د.إ/لتر\`)`,
      `- **الشريحة المطبقة فعلياً**: ${appliedTier.ar} (\`${formatNum(tierEval.appliedRateAedPerL)} د.إ/لتر\`) — التصنيف القسري لغياب المختبر: **${tierEval.moIatDefaultPenaltyActive ? 'مُفعّل (خطر مباشر)' : 'غير مفعل'}**`,
      `- **الضريبة الانتقائية 2026 مقابل 50% السابقة**: **${formatNum(tierEval.volumetricExcise2026Aed)} د.إ** (مقابل ${formatNum(tierEval.legacy50PctExciseAed)} د.إ سابقاً) | زيادة غياب المختبر: **${formatNum(tierEval.moIatMissingOverpaymentAed)} د.إ**`,
      `- **محاكاة إعادة الصياغة (${formatNum(input.targetReformulatedSugarPer100ml)} غ/100مل)**: ${refTier.ar} — الوفورات السنوية المقدرة: **${formatNum(tierEval.reformulationAnnualSavingsAed)} د.إ**`,
      '',
      '## 3. تقدير الالتزامات المالية والغرامات (قرار 75/2023)',
      '',
      `- **الضريبة الانتقائية الأساسية**: **${formatNum(exposure.baseExciseLiabilityAed)} د.إ**`,
      `- **تكلفة التصنيف القسري لغياب شهادة MoIAT**: **${formatNum(exposure.moIatOverpaymentPenaltyAed)} د.إ**`,
      `- **فائدة التأخير السنوية (14% على ${input.lateMonthsUnderAudit} شهراً)**: **${formatNum(exposure.latePaymentInterest14PctAed)} د.إ**`,
      `- **غرامة السجلات والتوثيق (قرار 75/2023)**: **${formatNum(exposure.docRecordPenaltyAed)} د.إ**`,
      `- **إجمالي التعرض المالي المقدر**: **${formatNum(exposure.totalFinancialExposureAed)} د.إ**`,
      '',
      '## 4. مصفوفة الضوابط الستة (100 نقطة)',
      '',
      '| الضابط | الحالة | الوزن | البيان |',
      '|---|---|---|---|',
      ...result.controls.map(
        (c) => `| \`${c.id}\` | ${c.implemented ? 'مُنفّذ' : 'ناقص'} | ${c.weight} | ${escMdCell(c.titleAr)} |`,
      ),
    ];

    if (result.csvAudit && result.csvAudit.totalRows > 0) {
      lines.push(
        '',
        '## 5. ملخص تدقيق كشف الأصناف CSV',
        '',
        `- الصفوف: ${result.csvAudit.totalRows} | جاهز: ${result.csvAudit.readyCount} | مشروط: ${result.csvAudit.conditionalCount} | محجوب: ${result.csvAudit.blockedCount} | تفتقر لشهادة MoIAT: ${result.csvAudit.missingLabCount} | صيغ محيدة \`CWE-1236\`: ${result.csvAudit.formulaSanitizedCount}`,
        `- إجمالي الحجم المخفف: **${formatNum(result.csvAudit.totalReconstitutedLitres)} لتر** | الضريبة المقدرة: **${formatNum(result.csvAudit.totalExciseLiabilityAed)} د.إ** | مخاطر الغياب المخبري: **${formatNum(result.csvAudit.totalMoIatOverpaymentRiskAed)} د.إ**`,
        '',
        '| الصف | رمز SKU | الصنف | السكر غ/100مل | اللترات النهائية | شهادة MoIAT | السعر (د.إ/لتر) | الضريبة (د.إ) | الحالة |',
        '|---|---|---|---|---|---|---|---|---|',
        ...result.csvAudit.rows.map(
          (row) =>
            `| ${row.rowNumber} | \`${escMdCell(row.skuCode)}\` | ${escMdCell(row.productName)} | ${formatNum(row.sugarPer100ml)} | ${formatNum(row.reconstitutedLitres)} | ${row.moIatCertified ? 'نعم' : 'لا'} | ${formatNum(row.appliedRateAedPerL)} | ${formatNum(row.estimatedExciseAed)} | **${row.status.toUpperCase()}** |`,
        ),
      );
    }

    if (result.findings.length > 0) {
      lines.push(
        '',
        '## 6. الملاحظات التشريعية والفجوات المرصودة',
        '',
        ...result.findings.map(
          (f) => `- **[${f.severity.toUpperCase()} / ${f.code}]** ${f.titleAr} — ${f.detailAr} (*${f.legalRef}*)`,
        ),
      );
    }

    return lines.join('\n');
  }

  const lines: string[] = [
    `# UAE Tiered Sweetened Beverage Excise Readiness Dossier — \`${dossierCode}\``,
    '',
    `> **Independence Notice:** ${result.legalDisclaimerEn}`,
    '',
    '## 1. Entity, Beverage SKU & Readiness Overview',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Dossier Code | \`${escMdCell(dossierCode)}\` |`,
    `| Tool Version | \`SugarTaxAE v${escMdCell(result.version)}\` |`,
    `| Taxable Entity | ${escMdCell(input.organizationName)} |`,
    `| UAE TRN | \`${escMdCell(input.trnNumber)}\` |`,
    `| Beverage SKU | ${escMdCell(input.productName)} |`,
    `| Category / Format | ${cat.en} — ${fmt.en} |`,
    `| Ready Sugar Content | **${formatNum(input.sugarGramsPer100mlReady)} g/100ml** (Artificial only: ${input.artificialSweetenersOnly ? 'Yes' : 'No'}) |`,
    `| Tax Period End / EmaraTax EX201 Due (Day 15) | \`${escMdCell(input.taxPeriodEndDate)}\` / \`${escMdCell(tierEval.emaraTaxReturnDueDate)}\` |`,
    `| Readiness Status & Score | **${result.status.toUpperCase()}** (**${result.readinessScore}/100**) |`,
    `| SHA-256 Digest | \`${escMdCell(digest)}\` |`,
    '',
    '## 2. Volumetric Tiering & MoIAT Lab Proof (Cabinet Decision 197/2025)',
    '',
    `- **Reconstituted Final Volume**: **${formatNum(tierEval.reconstitutedLitres)} L** (Base: ${formatNum(input.baseUnitsOrLitres)} × dilution ratio ${formatNum(input.reconstitutionRatioLitresPerUnit)})`,
    `- **Recipe-Implied Tier**: ${impliedTier.en} (\`AED ${formatNum(tierEval.recipeImpliedRateAedPerL)}/L\`)`,
    `- **Applied Statutory Tier**: ${appliedTier.en} (\`AED ${formatNum(tierEval.appliedRateAedPerL)}/L\`) — Missing-lab default active: **${tierEval.moIatDefaultPenaltyActive ? 'YES (ACTIVE BLOCKER)' : 'No'}**`,
    `- **2026 Volumetric vs Legacy 50% Excise**: **AED ${formatNum(tierEval.volumetricExcise2026Aed)}** (vs AED ${formatNum(tierEval.legacy50PctExciseAed)} legacy) | Missing-MoIAT overpayment: **AED ${formatNum(tierEval.moIatMissingOverpaymentAed)}**`,
    `- **Reformulation Scenario (${formatNum(input.targetReformulatedSugarPer100ml)} g/100ml)**: ${refTier.en} — Estimated annual savings: **AED ${formatNum(tierEval.reformulationAnnualSavingsAed)}**`,
    '',
    '## 3. Financial Liability & Penalty Exposure (CD 75/2023)',
    '',
    `- **Base Excise Liability**: **AED ${formatNum(exposure.baseExciseLiabilityAed)}**`,
    `- **Missing MoIAT Lab Overpayment**: **AED ${formatNum(exposure.moIatOverpaymentPenaltyAed)}**`,
    `- **Late Payment Interest (14% p.a. over ${input.lateMonthsUnderAudit} months)**: **AED ${formatNum(exposure.latePaymentInterest14PctAed)}**`,
    `- **Recordkeeping Penalty (CD 75/2023)**: **AED ${formatNum(exposure.docRecordPenaltyAed)}**`,
    `- **Total Estimated Exposure**: **AED ${formatNum(exposure.totalFinancialExposureAed)}**`,
    '',
    '## 4. Six-Control Compliance Matrix (100 Points)',
    '',
    '| Control | Status | Weight | Description |',
    '|---|---|---|---|',
    ...result.controls.map(
      (c) => `| \`${c.id}\` | ${c.implemented ? 'Implemented' : 'Gap'} | ${c.weight} | ${escMdCell(c.titleEn)} |`,
    ),
  ];

  if (result.csvAudit && result.csvAudit.totalRows > 0) {
    lines.push(
      '',
      '## 5. Multi-SKU Beverage CSV Audit Summary',
      '',
      `- Rows: ${result.csvAudit.totalRows} | Ready: ${result.csvAudit.readyCount} | Conditional: ${result.csvAudit.conditionalCount} | Blocked: ${result.csvAudit.blockedCount} | Missing Lab: ${result.csvAudit.missingLabCount} | CWE-1236 Sanitized: ${result.csvAudit.formulaSanitizedCount}`,
      `- Reconstituted Litres: **${formatNum(result.csvAudit.totalReconstitutedLitres)} L** | Estimated Excise: **AED ${formatNum(result.csvAudit.totalExciseLiabilityAed)}** | Lab Overpayment Risk: **AED ${formatNum(result.csvAudit.totalMoIatOverpaymentRiskAed)}**`,
      '',
      '| Row | SKU Code | Product | Sugar g/100ml | Final Litres | MoIAT Lab | Rate (AED/L) | Excise (AED) | Status |',
      '|---|---|---|---|---|---|---|---|---|',
      ...result.csvAudit.rows.map(
        (row) =>
          `| ${row.rowNumber} | \`${escMdCell(row.skuCode)}\` | ${escMdCell(row.productName)} | ${formatNum(row.sugarPer100ml)} | ${formatNum(row.reconstitutedLitres)} | ${row.moIatCertified ? 'Yes' : 'No'} | ${formatNum(row.appliedRateAedPerL)} | ${formatNum(row.estimatedExciseAed)} | **${row.status.toUpperCase()}** |`,
      ),
    );
  }

  if (result.findings.length > 0) {
    lines.push(
      '',
      '## 6. Statutory Findings & Remediation Notes',
      '',
      ...result.findings.map(
        (f) => `- **[${f.severity.toUpperCase()} / ${f.code}]** ${f.titleEn} — ${f.detailEn} (*${f.legalRef}*)`,
      ),
    );
  }

  return lines.join('\n');
}
