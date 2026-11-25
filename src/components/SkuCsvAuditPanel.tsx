import { Download, FileSpreadsheet, ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';
import { auditSkuCsv, exportSkuAuditCsv } from '../core/skuCsvAuditor.ts';
import type { SkuCsvAuditSummary } from '../core/types.ts';
import { STATUS_LABELS, type Locale } from '../lib/i18n.ts';

interface Props {
  skuCsv: string;
  locale: Locale;
  onChangeCsv: (next: string) => void;
  onExportSafeCsv: (filename: string, csvContent: string) => void;
}

export function SkuCsvAuditPanel({ skuCsv, locale, onChangeCsv, onExportSafeCsv }: Props) {
  const isAr = locale === 'ar';
  const summary: SkuCsvAuditSummary = useMemo(() => auditSkuCsv(skuCsv), [skuCsv]);

  const handleExport = () => {
    const out = exportSkuAuditCsv(summary);
    onExportSafeCsv('sugartaxae-sku-audit.csv', out);
  };

  return (
    <div className="space-y-4">
      <section className="sugar-card rounded-2xl p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-[var(--text-primary)]">
              <FileSpreadsheet className="h-4 w-4 text-[var(--accent-primary)]" />
              {isAr
                ? 'مدقق كشف الأصناف المتعددة وتطهير حقن الصيغ (CWE-1236)'
                : 'Multi-SKU Beverage CSV Batch Auditor & CWE-1236 Sanitizer'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {isAr
                ? 'يحسب الحجم المخفف لكل SKU ويكشف غياب شهادات MoIAT ويحيد صيغ Excel الخبيثة مع تصدير UTF-8 BOM'
                : 'Audits reconstituted litres, flags missing MoIAT lab proofs, neutralizes formula payloads, and exports UTF-8 BOM CSV'}
            </p>
          </div>

          <button
            type="button"
            data-testid="export-sku-csv-btn"
            onClick={handleExport}
            disabled={summary.rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-bold text-[var(--accent-primary-fg)] hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {isAr ? 'تصدير CSV الآمن (UTF-8 BOM)' : 'Export Safe CSV (UTF-8 BOM)'}
          </button>
        </div>

        <textarea
          data-testid="csv-textarea"
          aria-label={isAr ? 'بيانات أصناف المشروبات CSV' : 'Beverage SKU CSV input'}
          dir="ltr"
          rows={5}
          className="sugar-input sugar-mono text-xs leading-relaxed"
          value={skuCsv}
          onChange={(e) => onChangeCsv(e.target.value)}
        />

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <div className="rounded-xl bg-[var(--bg-elevated)] p-2.5 text-xs">
            <div className="text-[var(--text-secondary)]">{isAr ? 'إجمالي الأصناف' : 'Total SKUs'}</div>
            <div className="sugar-mono num-tabular mt-0.5 text-base font-extrabold">
              {summary.totalRows}
            </div>
          </div>
          <div className="rounded-xl bg-[var(--bg-elevated)] p-2.5 text-xs">
            <div className="text-[var(--text-secondary)]">{isAr ? 'جاهز / مشروط' : 'Ready / Cond.'}</div>
            <div className="sugar-mono num-tabular mt-0.5 text-base font-extrabold text-[var(--accent-emerald)]">
              {summary.readyCount} / {summary.conditionalCount}
            </div>
          </div>
          <div className="rounded-xl bg-[var(--bg-elevated)] p-2.5 text-xs">
            <div className="text-[var(--text-secondary)]">{isAr ? 'تفتقر للمختبر' : 'Missing MoIAT'}</div>
            <div className="sugar-mono num-tabular mt-0.5 text-base font-extrabold text-[var(--accent-crimson)]">
              {summary.blockedCount}
            </div>
          </div>
          <div className="rounded-xl bg-[var(--bg-elevated)] p-2.5 text-xs">
            <div className="text-[var(--text-secondary)]">{isAr ? 'مخاطر الفائض' : 'Overpay Risk'}</div>
            <div className="sugar-mono num-tabular mt-0.5 text-base font-extrabold text-[var(--accent-amber)]">
              {Math.round(summary.totalMoIatOverpaymentRiskAed).toLocaleString('en-US')} AED
            </div>
          </div>
          <div className="rounded-xl bg-[var(--bg-elevated)] p-2.5 text-xs">
            <div className="text-[var(--text-secondary)]">{isAr ? 'تحييد CWE-1236' : 'CWE-1236 Guard'}</div>
            <div className="sugar-mono num-tabular mt-0.5 text-base font-extrabold text-[var(--accent-teal)]">
              {summary.formulaSanitizedCount}
            </div>
          </div>
        </div>

        {summary.parseErrors.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--accent-crimson)] bg-[var(--accent-crimson-soft)] p-3 text-xs text-[var(--accent-crimson)]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{summary.parseErrors.join(' | ')}</div>
          </div>
        )}
      </section>

      {summary.rows.length > 0 && (
        <section className="sugar-card overflow-x-auto rounded-2xl p-4 sm:p-5">
          <table className="w-full min-w-[680px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <th className="py-2 text-start font-bold">SKU</th>
                <th className="py-2 text-start font-bold">{isAr ? 'الصنف' : 'Product'}</th>
                <th className="py-2 text-end font-bold">{isAr ? 'سكر/100مل' : 'g/100ml'}</th>
                <th className="py-2 text-end font-bold">{isAr ? 'لترات نهائية' : 'Final Litres'}</th>
                <th className="py-2 text-center font-bold">MoIAT</th>
                <th className="py-2 text-end font-bold">{isAr ? 'د.إ/لتر' : 'AED/L'}</th>
                <th className="py-2 text-end font-bold">{isAr ? 'الضريبة (د.إ)' : 'Excise AED'}</th>
                <th className="py-2 text-center font-bold">{isAr ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.rowNumber} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="sugar-mono py-2.5 font-semibold">{row.skuCode}</td>
                  <td className="py-2.5 font-medium text-[var(--text-primary)]">{row.productName}</td>
                  <td className="sugar-mono num-tabular py-2.5 text-end">
                    {row.sugarPer100ml.toFixed(1)}
                  </td>
                  <td className="sugar-mono num-tabular py-2.5 text-end">
                    {Math.round(row.reconstitutedLitres).toLocaleString('en-US')}
                  </td>
                  <td className="py-2.5 text-center">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        backgroundColor: row.moIatCertified
                          ? 'var(--accent-emerald-soft)'
                          : 'var(--accent-crimson-soft)',
                        color: row.moIatCertified
                          ? 'var(--accent-emerald)'
                          : 'var(--accent-crimson)',
                      }}
                    >
                      {row.moIatCertified ? (isAr ? 'معتمد' : 'YES') : isAr ? 'مفقود' : 'NO'}
                    </span>
                  </td>
                  <td className="sugar-mono num-tabular py-2.5 text-end font-bold">
                    {row.appliedRateAedPerL.toFixed(2)}
                  </td>
                  <td className="sugar-mono num-tabular py-2.5 text-end font-bold">
                    {Math.round(row.estimatedExciseAed).toLocaleString('en-US')}
                  </td>
                  <td className="py-2.5 text-center">
                    <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-0.5 text-[11px] font-bold">
                      {STATUS_LABELS[row.status][locale]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
