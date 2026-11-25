import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  Lock,
  Printer,
  Save,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { AssessmentResult } from '../core/types.ts';
import type { SugarTaxDossierRecord } from '../lib/api.ts';
import { STATUS_LABELS, type Locale } from '../lib/i18n.ts';

interface Props {
  dossiers: SugarTaxDossierRecord[];
  liveResult: AssessmentResult;
  locale: Locale;
  busyAction: string | null;
  onSaveDraft: (title: string) => void;
  onFinalize: (record: SugarTaxDossierRecord) => void;
  onDuplicate: (record: SugarTaxDossierRecord) => void;
  onDelete: (record: SugarTaxDossierRecord) => void;
  onDownloadBrief: (record: SugarTaxDossierRecord) => void;
  onDownloadCsv: (record: SugarTaxDossierRecord) => void;
  onOpenPublic: (slugOrCode: string) => void;
  onCopyPublicUrl: (slugOrCode: string) => void;
}

export function DossierVaultAndPrint({
  dossiers,
  liveResult,
  locale,
  busyAction,
  onSaveDraft,
  onFinalize,
  onDuplicate,
  onDelete,
  onDownloadBrief,
  onDownloadCsv,
  onOpenPublic,
  onCopyPublicUrl,
}: Props) {
  const isAr = locale === 'ar';
  const [title, setTitle] = useState('');

  return (
    <div className="space-y-4">
      <section className="sugar-card no-print rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[240px] flex-1">
            <label
              htmlFor="dossier-title"
              className="mb-1 block text-xs font-bold text-[var(--text-secondary)]"
            >
              {isAr
                ? 'حفظ ملف جاهزية جديد (EX-YYYY-0001 + بصمة SHA-256)'
                : 'Save New Excise Dossier Draft (EX-YYYY-0001 + SHA-256)'}
            </label>
            <input
              id="dossier-title"
              type="text"
              className="sugar-input"
              placeholder={
                isAr
                  ? `${liveResult.organizationName} — ${liveResult.taxPeriodEndDate}`
                  : `${liveResult.organizationName} — ${liveResult.taxPeriodEndDate}`
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="save-draft-btn"
              disabled={busyAction === 'save'}
              onClick={() => {
                onSaveDraft(title);
                setTitle('');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-bold text-[var(--accent-primary-fg)] hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {isAr ? 'حفظ المسودة' : 'Save Draft'}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)]"
            >
              <Printer className="h-3.5 w-3.5" />
              {isAr ? 'طباعة A4 PDF' : 'Print A4 PDF'}
            </button>
          </div>
        </div>
      </section>

      <section className="sugar-card rounded-2xl p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
              {isAr ? 'خزنة ملفات الضريبة الانتقائية المحفوظة' : 'Saved Excise Dossiers Vault'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {isAr
                ? 'ختم الملف يثبّت البصمة التشفيرية SHA-256 ويمنح رابط مشاركة غير قابل للتعديل'
                : 'Finalizing seals the SHA-256 snapshot and enables immutable public verification links'}
            </p>
          </div>
          <span className="sugar-mono num-tabular rounded-lg bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-bold">
            {dossiers.length}
          </span>
        </div>

        {dossiers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] p-6 text-center text-xs text-[var(--text-secondary)]">
            {isAr
              ? 'لا توجد ملفات محفوظة بعد. احفظ التقييم الحالي أعلاه لإنشاء EX-2026-0001.'
              : 'No dossiers saved yet. Save the active assessment above to mint EX-2026-0001.'}
          </div>
        ) : (
          <div className="space-y-3">
            {dossiers.map((rec) => {
              const isLocked = Boolean(rec.lockedAt);
              const isBusy = busyAction === rec.dossierCode;
              return (
                <article
                  key={rec.dossierCode}
                  data-testid={`dossier-card-${rec.dossierCode}`}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="sugar-mono rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-extrabold text-[var(--accent-primary)]">
                        {rec.dossierCode}
                      </span>
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {rec.title}
                      </span>
                      <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-0.5 text-[11px] font-bold">
                        {STATUS_LABELS[rec.status][locale]} · {rec.readinessScore}/100
                      </span>
                      {isLocked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-emerald-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent-emerald)]">
                          <Lock className="h-3 w-3" />
                          {isAr ? 'مختوم' : 'Sealed'}
                        </span>
                      )}
                    </div>

                    <div className="sugar-mono text-[11px] font-semibold text-[var(--text-secondary)]">
                      {rec.appliedRateAedPerL.toFixed(2)} AED/L ·{' '}
                      {Math.round(rec.volumetricExciseAed).toLocaleString('en-US')} AED
                    </div>
                  </div>

                  <p className="sugar-mono mt-1.5 break-all text-[11px] text-[var(--text-secondary)]">
                    SHA-256: {rec.dossierSha256}
                  </p>

                  <div className="no-print mt-3 flex flex-wrap items-center gap-2">
                    {!isLocked && (
                      <button
                        type="button"
                        data-testid={`finalize-${rec.dossierCode}`}
                        disabled={isBusy}
                        onClick={() => onFinalize(rec)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-emerald)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        {isAr ? 'ختم نهائي' : 'Finalize & Seal'}
                      </button>
                    )}

                    <button
                      type="button"
                      data-testid={`brief-md-${rec.dossierCode}`}
                      onClick={() => onDownloadBrief(rec)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {isAr ? 'تقرير Markdown' : 'Brief .md'}
                    </button>

                    <button
                      type="button"
                      data-testid={`export-csv-${rec.dossierCode}`}
                      onClick={() => onDownloadCsv(rec)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV (BOM)
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onDuplicate(rec)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {isAr ? 'نسخ' : 'Duplicate'}
                    </button>

                    {!isLocked && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onDelete(rec)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent-crimson)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-crimson)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isAr ? 'حذف' : 'Delete'}
                      </button>
                    )}

                    {isLocked && (
                      <>
                        <button
                          type="button"
                          data-testid={`public-link-${rec.dossierCode}`}
                          onClick={() => onOpenPublic(rec.publicSlug || rec.dossierCode)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-bold text-[var(--accent-primary-fg)]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {isAr ? 'فتح التقرير العام' : 'View Sealed Report'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onCopyPublicUrl(rec.publicSlug || rec.dossierCode)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {isAr ? 'نسخ الرابط' : 'Copy Link'}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
