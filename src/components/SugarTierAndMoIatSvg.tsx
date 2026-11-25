import {
  HIGH_SUGAR_THRESHOLD_G_PER_100ML,
  MODERATE_SUGAR_THRESHOLD_G_PER_100ML,
} from '../core/sugarTaxCatalog.ts';
import type { AssessmentInput, AssessmentResult, ReadinessStatus } from '../core/types.ts';
import type { Locale } from '../lib/i18n.ts';

interface Props {
  input: AssessmentInput;
  result: AssessmentResult;
  locale: Locale;
}

function statusStroke(status: ReadinessStatus): string {
  if (status === 'ready') return 'var(--accent-emerald)';
  if (status === 'conditional') return 'var(--accent-amber)';
  return 'var(--accent-crimson)';
}

function fmtAed(val: number, isAr: boolean): string {
  const unit = isAr ? 'د.إ' : 'AED';
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(2)}M ${unit}`;
  }
  return `${Math.round(val).toLocaleString('en-US')} ${unit}`;
}

export function SugarTierAndMoIatSvg({ input, result, locale }: Props) {
  const isAr = locale === 'ar';
  const { tierEval, exposure, readinessScore, status } = result;

  const trackMaxW = 292;
  const maxExciseCompare = Math.max(
    1,
    tierEval.volumetricExcise2026Aed,
    tierEval.legacy50PctExciseAed,
    tierEval.moIatMissingOverpaymentAed,
  );
  const scaleVol = (v: number) =>
    Math.max(8, Math.min(trackMaxW, Math.round((v / maxExciseCompare) * trackMaxW)));

  const p1HeadingX = isAr ? 314 : 26;
  const p1MetricX = isAr ? 26 : 314;
  const p1BoxHeadingX = isAr ? 304 : 36;
  const p1BoxMetricX = isAr ? 36 : 304;

  const p2HeadingX = isAr ? 654 : 366;
  const p2MetricX = isAr ? 366 : 654;
  const p2CardHeadingX = isAr ? 644 : 376;
  const p2CardMetricX = isAr ? 376 : 644;

  const barOriginX1 = (w: number) => (isAr ? 316 - w : 24);
  const barOriginX2 = (w: number) => (isAr ? 656 - w : 364);

  // Sugar scale marker across 0..12 g/100ml inside Panel 1 (x = 24..316, width 292)
  const clampedSugar = Math.max(0, Math.min(12, input.sugarGramsPer100mlReady));
  const sugarX = Math.round(24 + (clampedSugar / 12) * 292);
  const lowW = Math.round((MODERATE_SUGAR_THRESHOLD_G_PER_100ML / 12) * 292); // 0..5g
  const midW = Math.round(
    ((HIGH_SUGAR_THRESHOLD_G_PER_100ML - MODERATE_SUGAR_THRESHOLD_G_PER_100ML) / 12) * 292,
  ); // 5..8g
  const highW = 292 - lowW - midW; // 8..12g

  const compareRows = [
    {
      label: isAr ? 'ضريبة 2026 الحجمية المطبقة' : 'Applied 2026 Volumetric Excise',
      value: tierEval.volumetricExcise2026Aed,
      color: tierEval.moIatDefaultPenaltyActive
        ? 'var(--accent-crimson)'
        : 'var(--accent-primary)',
      y: 138,
    },
    {
      label: isAr ? 'الضريبة السابقة (50% سعر)' : 'Legacy 50% Ad-Valorem Excise',
      value: tierEval.legacy50PctExciseAed,
      color: 'var(--accent-teal)',
      y: 186,
    },
    {
      label: isAr ? 'زيادة غياب مختبر MoIAT' : 'Missing MoIAT Lab Overpayment',
      value: tierEval.moIatMissingOverpaymentAed,
      color: tierEval.moIatMissingOverpaymentAed > 0 ? 'var(--accent-crimson)' : 'var(--accent-emerald)',
      y: 234,
    },
  ];

  const readinessW = Math.max(6, Math.min(292, Math.round((readinessScore / 100) * 292)));
  const implementedCount = result.controls.filter((c) => c.implemented).length;

  const moIatOk =
    !tierEval.moIatDefaultPenaltyActive &&
    (tierEval.appliedTier === 'exempt_dairy_or_100_juice' ||
      input.beverageCategory === 'energy_drink' ||
      (input.hasMoIatAccreditedLabReport && input.hasMoIatConformityCert));
  const ex201Ok = Boolean(tierEval.emaraTaxReturnDueDate) && input.registeredOnEmaraTax;
  const exposureOk = exposure.totalFinancialExposureAed === 0;

  const gateCards = [
    {
      label: isAr ? 'مختبر MoIAT ISO 17025' : 'MoIAT ISO 17025 / ECAS Gate',
      badge: tierEval.moIatDefaultPenaltyActive
        ? isAr
          ? 'قسري 1.09'
          : '1.09 DEFAULT'
        : moIatOk
          ? isAr
            ? 'شهادة معتمدة'
            : 'LAB VERIFIED'
          : isAr
            ? 'يحتاج توثيق'
            : 'NEEDS PROOF',
      ok: moIatOk,
      y: 158,
    },
    {
      label: isAr ? 'موعد EX201 (اليوم 15)' : 'EmaraTax EX201 (Day 15)',
      badge: tierEval.emaraTaxReturnDueDate || (isAr ? 'غير صالح' : 'INVALID'),
      ok: ex201Ok,
      y: 204,
    },
    {
      label: isAr ? 'إجمالي التعرض (75/2023)' : 'Total Exposure (CD 75/2023)',
      badge: fmtAed(exposure.totalFinancialExposureAed, isAr),
      ok: exposureOk,
      y: 250,
    },
  ];

  return (
    <section className="sugar-card rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            {isAr
              ? 'مؤشر شرائح السكر المتدرجة (1.09 / 0.79 / 0 د.إ) وفحص مختبر MoIAT'
              : 'UAE Tiered Sugar Tax (1.09 / 0.79 / 0 AED/L) & MoIAT Lab Telemetry'}
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            {isAr
              ? 'قرار مجلس الوزراء 197/2025 النافذ منذ 2026-01-01، السقوط القسري 1.09 د.إ عند غياب المختبر، ووفورات خفض السكر دون 5غ'
              : 'Cabinet Decision 197/2025 (effective 2026-01-01), 1.09 AED/L missing-lab default, and sub-5g reformulation savings'}
          </p>
        </div>
        <span className="sugar-mono num-tabular rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
          <bdi dir="ltr">{input.sugarGramsPer100mlReady.toFixed(1)} g/100ml</bdi> ·{' '}
          <bdi dir="ltr">{tierEval.appliedRateAedPerL.toFixed(2)} AED/L</bdi> ·{' '}
          <bdi dir="ltr">{tierEval.emaraTaxReturnDueDate || '---'}</bdi>
        </span>
      </div>

      <svg
        viewBox="0 0 680 328"
        className="h-auto w-full"
        direction={isAr ? 'rtl' : 'ltr'}
        role="img"
        aria-label={
          isAr
            ? 'مخطط شرائح ضريبة المشروبات المحلاة الإماراتية والتعرض المالي'
            : 'UAE Tiered Sweetened Beverage Excise & Financial Exposure Telemetry'
        }
      >
        {/* Panel 1: Sugar Tier Scale & 2026 vs Legacy Comparison */}
        <rect
          x="12"
          y="10"
          width="316"
          height="308"
          rx="14"
          fill="var(--bg-elevated)"
          stroke="var(--border-subtle)"
          strokeWidth="1.2"
        />
        <text
          x={p1HeadingX}
          y="36"
          textAnchor="start"
          fontSize="12.5"
          fontWeight="700"
          fill="var(--text-primary)"
        >
          {isAr ? '1. سلم السكر (غ/100مل) ومقارنة 2026' : '1. Sugar Tiers (g/100ml) & 2026 Diff'}
        </text>
        <text
          x={p1MetricX}
          y="36"
          textAnchor="end"
          fontSize="10.5"
          fontWeight="700"
          fill="var(--accent-primary)"
        >
          {isAr
            ? `${tierEval.appliedRateAedPerL.toFixed(2)} د.إ/لتر`
            : `${tierEval.appliedRateAedPerL.toFixed(2)} AED/L`}
        </text>

        {/* Continuous Sugar Spectrum Track (left-to-right numeric scale 0 -> 5 -> 8 -> 12g) */}
        <text
          x={p1HeadingX}
          y="62"
          textAnchor="start"
          fontSize="10.5"
          fontWeight="600"
          fill="var(--text-secondary)"
        >
          {isAr
            ? 'أقل من 5غ (0) | 5 إلى 8غ (0.79) | 8غ فأكثر (1.09)'
            : '<5g (0) | 5-8g (0.79) | 8g+ (1.09 AED/L)'}
        </text>
        <g direction="ltr">
          <rect x="24" y="72" width={lowW} height="15" rx="4" fill="var(--accent-emerald)" opacity="0.85" />
          <rect x={24 + lowW} y="72" width={midW} height="15" fill="var(--accent-amber)" opacity="0.85" />
          <rect
            x={24 + lowW + midW}
            y="72"
            width={highW}
            height="15"
            rx="4"
            fill="var(--accent-crimson)"
            opacity="0.85"
          />
          <circle
            cx={sugarX}
            cy="79.5"
            r="6.5"
            fill="var(--bg-surface)"
            stroke="var(--text-primary)"
            strokeWidth="2.5"
          />
          <text x="24" y="102" textAnchor="start" fontSize="9.5" fontWeight="700" fill="var(--accent-emerald)">
            0g
          </text>
          <text
            x={24 + lowW}
            y="102"
            textAnchor="middle"
            fontSize="9.5"
            fontWeight="700"
            fill="var(--accent-amber)"
          >
            5g
          </text>
          <text
            x={24 + lowW + midW}
            y="102"
            textAnchor="middle"
            fontSize="9.5"
            fontWeight="700"
            fill="var(--accent-crimson)"
          >
            8g
          </text>
          <text x="316" y="102" textAnchor="end" fontSize="9.5" fontWeight="600" fill="var(--text-secondary)">
            12g+
          </text>
        </g>

        {compareRows.map((row) => {
          const w = row.value > 0 ? scaleVol(row.value) : 4;
          return (
            <g key={row.label}>
              <text
                x={p1HeadingX}
                y={row.y}
                textAnchor="start"
                fontSize="10.8"
                fontWeight="600"
                fill="var(--text-secondary)"
              >
                {row.label}
              </text>
              <text
                x={p1MetricX}
                y={row.y}
                textAnchor="end"
                fontSize="10.5"
                fontWeight="700"
                fill="var(--text-primary)"
              >
                {fmtAed(row.value, isAr)}
              </text>
              <rect
                x="24"
                y={row.y + 8}
                width="292"
                height="13"
                rx="6.5"
                fill="var(--bg-surface)"
                stroke="var(--border-subtle)"
              />
              <rect
                x={barOriginX1(w)}
                y={row.y + 8}
                width={w}
                height="13"
                rx="6.5"
                fill={row.color}
              />
            </g>
          );
        })}

        {/* Summary footer box inside Panel 1 */}
        <rect
          x="24"
          y="264"
          width="292"
          height="42"
          rx="10"
          fill="var(--bg-surface)"
          stroke="var(--border-subtle)"
        />
        <text
          x={p1BoxHeadingX}
          y="289"
          textAnchor="start"
          fontSize="10.8"
          fontWeight="600"
          fill="var(--text-secondary)"
        >
          {isAr ? 'وفر إعادة الصياغة السنوي' : 'Reformulation Annual Savings'}
        </text>
        <text
          x={p1BoxMetricX}
          y="289"
          textAnchor="end"
          fontSize="11.5"
          fontWeight="800"
          fill="var(--accent-emerald)"
        >
          {fmtAed(tierEval.reformulationAnnualSavingsAed, isAr)}
        </text>

        {/* Panel 2: Readiness Score & MoIAT / EX201 Gates */}
        <rect
          x="352"
          y="10"
          width="316"
          height="308"
          rx="14"
          fill="var(--bg-elevated)"
          stroke="var(--border-subtle)"
          strokeWidth="1.2"
        />
        <text
          x={p2HeadingX}
          y="36"
          textAnchor="start"
          fontSize="12.5"
          fontWeight="700"
          fill="var(--text-primary)"
        >
          {isAr ? '2. الجاهزية وحماية المختبر والمهل' : '2. Readiness, Lab & EX201 Gates'}
        </text>
        <text
          x={p2MetricX}
          y="36"
          textAnchor="end"
          fontSize="11"
          fontWeight="800"
          fill={statusStroke(status)}
        >
          {`${readinessScore}/100`}
        </text>

        <text
          x={p2HeadingX}
          y="66"
          textAnchor="start"
          fontSize="11"
          fontWeight="600"
          fill="var(--text-secondary)"
        >
          {isAr ? 'درجة جاهزية الامتثال الانتقائي' : 'Excise Compliance Readiness Score'}
        </text>
        <text
          x={p2MetricX}
          y="66"
          textAnchor="end"
          fontSize="11"
          fontWeight="700"
          fill="var(--text-primary)"
        >
          {isAr ? `${implementedCount} من 6` : `${implementedCount} / 6`}
        </text>
        <rect
          x="364"
          y="76"
          width="292"
          height="16"
          rx="8"
          fill="var(--bg-surface)"
          stroke="var(--border-subtle)"
        />
        <rect
          x={barOriginX2(readinessW)}
          y="76"
          width={readinessW}
          height="16"
          rx="8"
          fill={statusStroke(status)}
        />

        <text
          x={p2HeadingX}
          y="114"
          textAnchor="start"
          fontSize="10.5"
          fontWeight="600"
          fill="var(--text-secondary)"
        >
          {isAr
            ? `الحجم النهائي المخفف: ${Math.round(tierEval.reconstitutedLitres).toLocaleString('en-US')} لتر`
            : `Final Ready Volume: ${Math.round(tierEval.reconstitutedLitres).toLocaleString('en-US')} L`}
        </text>

        {gateCards.map((card) => (
          <g key={card.label}>
            <rect
              x="364"
              y={card.y - 18}
              width="292"
              height="36"
              rx="10"
              fill="var(--bg-surface)"
              stroke={card.ok ? 'var(--accent-emerald)' : 'var(--accent-amber)'}
              strokeWidth="1.2"
            />
            <text
              x={p2CardHeadingX}
              y={card.y + 4}
              textAnchor="start"
              fontSize="10.8"
              fontWeight="600"
              fill="var(--text-secondary)"
            >
              {card.label}
            </text>
            <text
              x={p2CardMetricX}
              y={card.y + 4}
              textAnchor="end"
              fontSize="11"
              fontWeight="800"
              fill={card.ok ? 'var(--accent-emerald)' : 'var(--accent-crimson)'}
            >
              {card.badge}
            </text>
          </g>
        ))}

        {/* Bottom disclaimer note */}
        <text
          x={p2HeadingX}
          y="296"
          textAnchor="start"
          fontSize="9.8"
          fontWeight="600"
          fill="var(--text-secondary)"
        >
          {isAr
            ? 'استرشادي — غير تابع لـ FTA أو MoIAT أو EmaraTax'
            : 'Indicative only — Not affiliated with FTA, MoIAT, or EmaraTax'}
        </text>
      </svg>
    </section>
  );
}
