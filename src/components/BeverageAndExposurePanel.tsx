import type {
  AssessmentInput,
  AssessmentResult,
  BeverageCategory,
  ProductFormat,
} from '../core/types.ts';
import { CATEGORY_LABELS, FORMAT_LABELS, TIER_LABELS, type Locale } from '../lib/i18n.ts';

interface Props {
  input: AssessmentInput;
  result: AssessmentResult;
  locale: Locale;
  onChange: (patch: Partial<AssessmentInput>) => void;
}

const CATEGORIES: readonly BeverageCategory[] = [
  'sweetened_beverage',
  'energy_drink',
  'milk_dairy_75plus',
  'natural_juice_100pct',
];

const FORMATS: readonly ProductFormat[] = [
  'ready_to_drink',
  'liquid_concentrate',
  'powder_sachet',
  'gel_extract',
];

function fmtMoney(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function BeverageAndExposurePanel({ input, result, locale, onChange }: Props) {
  const isAr = locale === 'ar';
  const { tierEval, exposure } = result;
  const currency = isAr ? 'د.إ' : 'AED';

  const kpiCards = [
    {
      label: isAr ? 'التعرفة المطبقة حالياً' : 'Applied Statutory Rate',
      value:
        input.beverageCategory === 'energy_drink'
          ? isAr
            ? `100% (${tierEval.appliedRateAedPerL.toFixed(2)} د.إ/لتر)`
            : `100% (${tierEval.appliedRateAedPerL.toFixed(2)} AED/L)`
          : isAr
            ? `${tierEval.appliedRateAedPerL.toFixed(2)} د.إ/لتر`
            : `${tierEval.appliedRateAedPerL.toFixed(2)} AED/L`,
      sub: TIER_LABELS[tierEval.appliedTier][locale],
      tone: tierEval.moIatDefaultPenaltyActive
        ? 'var(--accent-crimson)'
        : tierEval.appliedRateAedPerL === 0
          ? 'var(--accent-emerald)'
          : 'var(--accent-amber)',
    },
    {
      label: isAr ? 'الضريبة الانتقائية 2026' : '2026 Volumetric Excise',
      value: `${fmtMoney(tierEval.volumetricExcise2026Aed)} ${currency}`,
      sub: isAr
        ? `مقابل ${fmtMoney(tierEval.legacy50PctExciseAed)} ${currency} بالنظام السابق 50%`
        : `vs ${fmtMoney(tierEval.legacy50PctExciseAed)} AED under legacy 50%`,
      tone: 'var(--accent-primary)',
    },
    {
      label: isAr ? 'تكلفة غياب مختبر MoIAT' : 'Missing MoIAT Overpayment',
      value: `${fmtMoney(tierEval.moIatMissingOverpaymentAed)} ${currency}`,
      sub: tierEval.moIatDefaultPenaltyActive
        ? isAr
          ? 'سقوط قسري 1.09 د.إ/لتر مفعل'
          : '1.09 AED/L strict default active'
        : isAr
          ? 'محمي بشهادة المختبر / الإعفاء'
          : 'Protected by lab / exemption',
      tone:
        tierEval.moIatMissingOverpaymentAed > 0 ? 'var(--accent-crimson)' : 'var(--accent-emerald)',
    },
    {
      label: isAr ? 'وفر إعادة الصياغة' : 'Reformulation Savings',
      value: `${fmtMoney(tierEval.reformulationAnnualSavingsAed)} ${currency}`,
      sub: isAr
        ? `عند خفض السكر إلى ${input.targetReformulatedSugarPer100ml}غ/100مل`
        : `At target ${input.targetReformulatedSugarPer100ml}g/100ml ready sugar`,
      tone: 'var(--accent-emerald)',
    },
    {
      label: isAr ? 'إجمالي التعرض والغرامات' : 'Total Financial Exposure',
      value: `${fmtMoney(exposure.totalFinancialExposureAed)} ${currency}`,
      sub: isAr
        ? `فوائد ${fmtMoney(exposure.latePaymentInterest14PctAed)} + قرار 75 (${fmtMoney(exposure.docRecordPenaltyAed)})`
        : `14% interest ${fmtMoney(exposure.latePaymentInterest14PctAed)} + CD75 ${fmtMoney(exposure.docRecordPenaltyAed)}`,
      tone:
        exposure.totalFinancialExposureAed > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpiCards.map((card) => (
          <div key={card.label} className="sugar-card rounded-2xl p-4">
            <div className="text-xs font-semibold text-[var(--text-secondary)]">{card.label}</div>
            <div
              className="sugar-mono num-tabular mt-1.5 text-lg font-extrabold"
              style={{ color: card.tone }}
            >
              {card.value}
            </div>
            <div className="mt-1 text-[11px] leading-snug text-[var(--text-secondary)]">
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      <section className="sugar-card rounded-2xl p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-extrabold text-[var(--text-primary)]">
          {isAr
            ? 'معطيات المنشأة والمنتج والشريحة السكرية (قرار مجلس الوزراء 197/2025)'
            : 'Taxable Entity, Beverage SKU & Sugar Tier Inputs (Cabinet Decision 197/2025)'}
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label
              htmlFor="org-name"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'اسم المنشأة المستوردة / المنتجة' : 'Importer / Producer Name'}
            </label>
            <input
              id="org-name"
              type="text"
              className="sugar-input"
              value={input.organizationName}
              onChange={(e) => onChange({ organizationName: e.target.value })}
            />
          </div>

          <div>
            <label
              htmlFor="trn-number"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'الرقم الضريبي الإماراتي (TRN 15 خانة)' : 'UAE TRN (15 digits)'}
            </label>
            <input
              id="trn-number"
              type="text"
              dir="ltr"
              className="sugar-input sugar-mono"
              value={input.trnNumber}
              onChange={(e) => onChange({ trnNumber: e.target.value })}
            />
          </div>

          <div>
            <label
              htmlFor="period-end"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'نهاية الفترة الضريبية (موعد EX201 يوم 15)' : 'Tax Period End (EX201 due Day 15)'}
            </label>
            <input
              id="period-end"
              type="date"
              dir="ltr"
              className="sugar-input sugar-mono"
              value={input.taxPeriodEndDate}
              onChange={(e) => onChange({ taxPeriodEndDate: e.target.value })}
            />
          </div>

          <div>
            <label
              htmlFor="product-name"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'اسم المشروب / الصنف (SKU)' : 'Beverage Product Name (SKU)'}
            </label>
            <input
              id="product-name"
              type="text"
              className="sugar-input"
              value={input.productName}
              onChange={(e) => onChange({ productName: e.target.value })}
            />
          </div>

          <div>
            <label
              htmlFor="beverage-category"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'تصنيف المشروب الانتقائي' : 'Excise Beverage Category'}
            </label>
            <select
              id="beverage-category"
              className="sugar-input"
              value={input.beverageCategory}
              onChange={(e) =>
                onChange({ beverageCategory: e.target.value as BeverageCategory })
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c][locale]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="product-format"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'الشكل التجاري (جاهز أو مركز/مسحوق)' : 'Product Format (RTD vs Concentrate)'}
            </label>
            <select
              id="product-format"
              className="sugar-input"
              value={input.productFormat}
              onChange={(e) => onChange({ productFormat: e.target.value as ProductFormat })}
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABELS[f][locale]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="sugar-grams"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'إجمالي السكر الجاهز للشرب (غ / 100مل)' : 'Ready-to-Drink Sugar (g / 100ml)'}
            </label>
            <input
              id="sugar-grams"
              type="number"
              step="0.1"
              min="0"
              max="500"
              dir="ltr"
              className="sugar-input sugar-mono num-tabular"
              value={input.sugarGramsPer100mlReady}
              onChange={(e) =>
                onChange({ sugarGramsPer100mlReady: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>

          <div>
            <label
              htmlFor="base-volume"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'الكمية الأساسية (لتر أو وحدة مركزة)' : 'Base Units or Litres'}
            </label>
            <input
              id="base-volume"
              type="number"
              min="0"
              step="100"
              dir="ltr"
              className="sugar-input sugar-mono num-tabular"
              value={input.baseUnitsOrLitres}
              onChange={(e) =>
                onChange({ baseUnitsOrLitres: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>

          <div>
            <label
              htmlFor="dilution-ratio"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'معامل التخفيف (لتر نهائي/وحدة)' : 'Reconstitution Ratio (Ready L / Unit)'}
            </label>
            <input
              id="dilution-ratio"
              type="number"
              step="0.1"
              min="0.01"
              max="1000"
              dir="ltr"
              className="sugar-input sugar-mono num-tabular"
              disabled={input.productFormat === 'ready_to_drink'}
              value={
                input.productFormat === 'ready_to_drink'
                  ? 1
                  : input.reconstitutionRatioLitresPerUnit
              }
              onChange={(e) =>
                onChange({
                  reconstitutionRatioLitresPerUnit: Math.max(0.01, Number(e.target.value) || 1),
                })
              }
            />
          </div>

          <div>
            <label
              htmlFor="excise-price"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'السعر الانتقائي المرجعي (د.إ / لتر)' : 'Excise Price Reference (AED / L)'}
            </label>
            <input
              id="excise-price"
              type="number"
              step="0.5"
              min="0"
              dir="ltr"
              className="sugar-input sugar-mono num-tabular"
              value={input.retailOrExcisePricePerLitreAed}
              onChange={(e) =>
                onChange({
                  retailOrExcisePricePerLitreAed: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </div>

          <div>
            <label
              htmlFor="target-sugar"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'هدف إعادة الصياغة (غ / 100مل)' : 'Reformulation Target Sugar (g / 100ml)'}
            </label>
            <input
              id="target-sugar"
              type="number"
              step="0.1"
              min="0"
              dir="ltr"
              className="sugar-input sugar-mono num-tabular"
              value={input.targetReformulatedSugarPer100ml}
              onChange={(e) =>
                onChange({
                  targetReformulatedSugarPer100ml: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </div>

          <div>
            <label
              htmlFor="dairy-pct"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'نسبة الحليب / الألبان المؤهلة (%)' : 'Dairy Content Share (%)'}
            </label>
            <input
              id="dairy-pct"
              type="number"
              min="0"
              max="100"
              step="1"
              dir="ltr"
              className="sugar-input sugar-mono num-tabular"
              value={input.dairyPercentage}
              onChange={(e) =>
                onChange({
                  dairyPercentage: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                })
              }
            />
          </div>

          <div>
            <label
              htmlFor="late-months"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {isAr ? 'أشهر التأخير تحت الفحص (14% سنوياً)' : 'Late Months Under Audit (14% p.a.)'}
            </label>
            <input
              id="late-months"
              data-testid="late-months-input"
              type="number"
              min="0"
              max="120"
              step="1"
              dir="ltr"
              className="sugar-input sugar-mono num-tabular"
              value={input.lateMonthsUnderAudit}
              onChange={(e) =>
                onChange({ lateMonthsUnderAudit: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold">
            <input
              data-testid="toggle-moiat-lab"
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent-primary)]"
              checked={input.hasMoIatAccreditedLabReport}
              onChange={(e) => onChange({ hasMoIatAccreditedLabReport: e.target.checked })}
            />
            <span>
              {isAr
                ? 'تقرير مختبر معتمد ISO 17025 لتحليل السكر'
                : 'ISO/IEC 17025 Accredited Lab Sugar Report'}
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold">
            <input
              data-testid="toggle-moiat-cert"
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent-primary)]"
              checked={input.hasMoIatConformityCert}
              onChange={(e) => onChange({ hasMoIatConformityCert: e.target.checked })}
            />
            <span>
              {isAr
                ? 'شهادة مطابقة MoIAT ECAS سارية الصلاحية'
                : 'Valid MoIAT ECAS Conformity Certificate'}
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold">
            <input
              data-testid="toggle-dilution-proof"
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent-primary)]"
              checked={input.dilutionGuidelinesVerified}
              onChange={(e) => onChange({ dilutionGuidelinesVerified: e.target.checked })}
            />
            <span>
              {isAr
                ? 'اعتماد جدول التخفيف والكمية النهائية للمركزات'
                : 'Concentrate Dilution Yield Proof Verified'}
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold">
            <input
              data-testid="toggle-emaratax-reg"
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent-primary)]"
              checked={input.registeredOnEmaraTax}
              onChange={(e) => onChange({ registeredOnEmaraTax: e.target.checked })}
            />
            <span>
              {isAr
                ? 'الصنف مسجل ومربوط في بوابة EmaraTax'
                : 'SKU Registered & Linked on EmaraTax'}
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent-primary)]"
              checked={input.artificialSweetenersOnly}
              onChange={(e) => onChange({ artificialSweetenersOnly: e.target.checked })}
            />
            <span>
              {isAr
                ? 'محليات صناعية فقط دون أي سكر مضاف (0 د.إ/لتر)'
                : 'Artificial Sweeteners Only — Zero Sugar (0 AED/L)'}
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold">
            <input
              data-testid="toggle-repeat-doc"
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent-amber)]"
              checked={input.repeatDocViolationWithin24m}
              onChange={(e) => onChange({ repeatDocViolationWithin24m: e.target.checked })}
            />
            <span>
              {isAr
                ? 'مخالفة سجلات متكررة خلال 24 شهراً (20k د.إ)'
                : 'Repeat CD 75 Doc Violation <=24m (20k AED)'}
            </span>
          </label>
        </div>
      </section>
    </div>
  );
}
