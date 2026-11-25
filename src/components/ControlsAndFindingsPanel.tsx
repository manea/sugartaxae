import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { SUGAR_CONTROLS } from '../core/sugarTaxCatalog.ts';
import type { AssessmentResult, SeverityLevel, SugarControlId } from '../core/types.ts';
import { SEVERITY_LABELS, type Locale } from '../lib/i18n.ts';

interface Props {
  result: AssessmentResult;
  implementedControls: readonly SugarControlId[];
  locale: Locale;
  onToggleControl: (id: SugarControlId) => void;
  onSelectAllControls: () => void;
}

function severityStyle(sev: SeverityLevel) {
  if (sev === 'blocker') {
    return {
      border: 'var(--accent-crimson)',
      bg: 'var(--accent-crimson-soft)',
      text: 'var(--accent-crimson)',
      Icon: AlertOctagon,
    };
  }
  if (sev === 'warning') {
    return {
      border: 'var(--accent-amber)',
      bg: 'var(--accent-amber-soft)',
      text: 'var(--accent-amber)',
      Icon: AlertTriangle,
    };
  }
  return {
    border: 'var(--accent-teal)',
    bg: 'var(--accent-teal-soft)',
    text: 'var(--accent-teal)',
    Icon: Info,
  };
}

export function ControlsAndFindingsPanel({
  result,
  implementedControls,
  locale,
  onToggleControl,
  onSelectAllControls,
}: Props) {
  const isAr = locale === 'ar';
  const implementedSet = new Set(implementedControls);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="sugar-card rounded-2xl p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
              {isAr
                ? 'مصفوفة ضوابط الامتثال الستة (100 نقطة)'
                : 'Six Excise Compliance Controls (100 Points)'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {isAr
                ? 'فعّل الضوابط الموثقة لاحتساب درجة الجاهزية الفورية للمنشأة'
                : 'Toggle substantiated controls to update live excise readiness score'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="select-all-controls-btn"
              onClick={onSelectAllControls}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              {isAr ? 'تفعيل الكل' : 'Select All'}
            </button>
            <span className="sugar-mono num-tabular rounded-lg bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-bold text-[var(--accent-primary)]">
              {result.readinessScore}/100
            </span>
          </div>
        </div>

        <div className="space-y-2.5">
          {SUGAR_CONTROLS.map((ctrl) => {
            const active = implementedSet.has(ctrl.id);
            return (
              <button
                key={ctrl.id}
                type="button"
                data-testid={`control-${ctrl.id}`}
                aria-pressed={active}
                onClick={() => onToggleControl(ctrl.id)}
                className="w-full rounded-xl border p-3 text-start transition-colors"
                style={{
                  borderColor: active ? 'var(--accent-emerald)' : 'var(--border-subtle)',
                  backgroundColor: active ? 'var(--accent-emerald-soft)' : 'var(--bg-elevated)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{
                        color: active ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                      }}
                    />
                    <span className="sugar-mono text-xs font-bold text-[var(--accent-primary)]">
                      {ctrl.id}
                    </span>
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {isAr ? ctrl.titleAr : ctrl.titleEn}
                    </span>
                  </div>
                  <span className="sugar-mono num-tabular shrink-0 rounded-md bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                    +{ctrl.weight}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {isAr ? ctrl.descriptionAr : ctrl.descriptionEn}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sugar-card rounded-2xl p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
              {isAr
                ? 'النتائج التشريعية والفجوات المرصودة'
                : 'Statutory Findings & Remediation Queue'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {isAr
                ? `العوائق النشطة والتنبيهات (${result.activeGapCount})`
                : `Active blockers & compliance warnings (${result.activeGapCount})`}
            </p>
          </div>
          <span className="sugar-mono num-tabular rounded-lg bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]">
            {result.findings.length}
          </span>
        </div>

        <div className="space-y-2.5">
          {result.findings.map((finding) => {
            const st = severityStyle(finding.severity);
            const Icon = st.Icon;
            return (
              <div
                key={finding.code}
                className="rounded-xl border p-3"
                style={{ borderColor: st.border, backgroundColor: st.bg }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-4 w-4 shrink-0" style={{ color: st.text }} />
                    <span className="text-xs font-extrabold" style={{ color: st.text }}>
                      {SEVERITY_LABELS[finding.severity][locale]}
                    </span>
                    <span className="sugar-mono text-[11px] font-semibold text-[var(--text-secondary)]">
                      {finding.code}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
                    {finding.legalRef}
                  </span>
                </div>
                <div className="mt-1 text-xs font-bold text-[var(--text-primary)]">
                  {isAr ? finding.titleAr : finding.titleEn}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {isAr ? finding.detailAr : finding.detailEn}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
