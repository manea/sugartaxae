import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Database,
  FileCheck2,
  FlaskConical,
  Globe,
  Moon,
  Printer,
  Sun,
} from 'lucide-react';
import { BeverageAndExposurePanel } from './components/BeverageAndExposurePanel.tsx';
import { ControlsAndFindingsPanel } from './components/ControlsAndFindingsPanel.tsx';
import { DossierVaultAndPrint } from './components/DossierVaultAndPrint.tsx';
import { SkuCsvAuditPanel } from './components/SkuCsvAuditPanel.tsx';
import { SugarTierAndMoIatSvg } from './components/SugarTierAndMoIatSvg.tsx';
import { SUGAR_PRESETS } from './core/presets.ts';
import { assessSugarTaxReadiness, evaluateSugarTaxCoreSync } from './core/readinessAssessor.ts';
import { SUGARTAXAE_TOOL_VERSION, SUGAR_CONTROLS } from './core/sugarTaxCatalog.ts';
import type { AssessmentInput, AssessmentResult, SugarControlId } from './core/types.ts';
import {
  type ApiMode,
  type PublicSugarTaxReport,
  type SugarTaxDossierRecord,
  deleteDossier,
  detectServerMode,
  duplicateDossier,
  fetchBriefMarkdown,
  fetchExportCsv,
  fetchPublicReport,
  finalizeDossier,
  listDossiers,
  saveDossier,
} from './lib/api.ts';
import { stripBase, withBase } from './lib/basePath.ts';
import { STATUS_LABELS, UI_COPY, type Locale, type ThemeName } from './lib/i18n.ts';

type StudioTab = 'dashboard' | 'controls' | 'csv' | 'vault';

const LS_LOCALE = 'sugartaxae.v1.locale';
const LS_THEME = 'sugartaxae.v1.theme';

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LS_LOCALE);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {
    // Ignore storage read errors
  }
  return 'ar';
}

function getInitialTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(LS_THEME);
    if (saved === 'palm-alabaster' || saved === 'excise-night') return saved;
  } catch {
    // Ignore storage read errors
  }
  return 'palm-alabaster';
}

function parsePublicSlugFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const rel = stripBase(window.location.pathname);
  const match = rel.match(/^\/r\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [theme, setTheme] = useState<ThemeName>(getInitialTheme);
  const [mode, setMode] = useState<ApiMode>('local');
  const [activeTab, setActiveTab] = useState<StudioTab>('dashboard');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(SUGAR_PRESETS[0]!.id);
  const [input, setInput] = useState<AssessmentInput>(() =>
    structuredClone(SUGAR_PRESETS[0]!.input),
  );
  const [shaDigest, setShaDigest] = useState<string>('');
  const [dossiers, setDossiers] = useState<SugarTaxDossierRecord[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [publicSlugRoute, setPublicSlugRoute] = useState<string | null>(() =>
    parsePublicSlugFromLocation(),
  );
  const [publicReportState, setPublicReportState] = useState<{
    loading: boolean;
    error: string | null;
    data: PublicSugarTaxReport | null;
  }>({ loading: false, error: null, data: null });

  const copy = UI_COPY[locale];
  const isAr = locale === 'ar';

  const syncResult: AssessmentResult = useMemo(() => evaluateSugarTaxCoreSync(input), [input]);
  const liveResult: AssessmentResult = useMemo(
    () => ({ ...syncResult, dossierSha256: shaDigest || syncResult.dossierSha256 }),
    [syncResult, shaDigest],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(LS_LOCALE, locale);
    } catch {
      // Ignore storage write errors
    }
  }, [locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'excise-night' ? '#071312' : '#F7FAF8');
    }
    try {
      localStorage.setItem(LS_THEME, theme);
    } catch {
      // Ignore storage write errors
    }
  }, [theme]);

  useEffect(() => {
    let active = true;
    void assessSugarTaxReadiness(input).then((res) => {
      if (active) setShaDigest(res.dossierSha256);
    });
    return () => {
      active = false;
    };
  }, [input]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const detected = await detectServerMode();
      if (!mounted) return;
      setMode(detected);
      try {
        const items = await listDossiers(detected);
        if (mounted) setDossiers(items);
      } catch {
        // Ignore initial fetch errors
      }
    })();

    const onPop = () => {
      setPublicSlugRoute(parsePublicSlugFromLocation());
    };
    window.addEventListener('popstate', onPop);
    return () => {
      mounted = false;
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  useEffect(() => {
    if (!publicSlugRoute) return;
    let active = true;
    setPublicReportState({ loading: true, error: null, data: null });
    void (async () => {
      const detected = await detectServerMode();
      if (!active) return;
      setMode(detected);
      try {
        const rep = await fetchPublicReport(detected, publicSlugRoute);
        if (active) setPublicReportState({ loading: false, error: null, data: rep });
      } catch (err) {
        if (active) {
          setPublicReportState({
            loading: false,
            error: err instanceof Error ? err.message : copy.missingReport,
            data: null,
          });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [publicSlugRoute, copy.missingReport]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleSelectPreset = (presetId: string) => {
    const found = SUGAR_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setSelectedPresetId(found.id);
    setInput(structuredClone(found.input));
  };

  const handleInputPatch = (patch: Partial<AssessmentInput>) => {
    setInput((prev) => ({ ...prev, ...patch }));
  };

  const handleToggleControl = (id: SugarControlId) => {
    setInput((prev) => {
      const exists = prev.implementedControls.includes(id);
      const next = exists
        ? prev.implementedControls.filter((c) => c !== id)
        : [...prev.implementedControls, id];
      return { ...prev, implementedControls: next };
    });
  };

  const refreshDossiers = async (targetMode: ApiMode = mode) => {
    const items = await listDossiers(targetMode);
    setDossiers(items);
  };

  const handleSaveDraft = async (title: string) => {
    setBusyAction('save');
    try {
      const saved = await saveDossier(mode, input, title);
      await refreshDossiers();
      showToast(
        isAr ? `تم حفظ المسودة ${saved.dossierCode}` : `Saved draft ${saved.dossierCode}`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleFinalize = async (record: SugarTaxDossierRecord) => {
    setBusyAction(record.dossierCode);
    try {
      const sealed = await finalizeDossier(mode, record);
      await refreshDossiers();
      showToast(
        isAr
          ? `تم ختم الملف ${sealed.dossierCode} بنجاح`
          : `Finalized & sealed ${sealed.dossierCode}`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Finalize failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDuplicate = async (record: SugarTaxDossierRecord) => {
    setBusyAction(record.dossierCode);
    try {
      const cloned = await duplicateDossier(mode, record);
      await refreshDossiers();
      showToast(
        isAr ? `تم إنشاء نسخة ${cloned.dossierCode}` : `Duplicated as ${cloned.dossierCode}`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Duplicate failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (record: SugarTaxDossierRecord) => {
    setBusyAction(record.dossierCode);
    try {
      await deleteDossier(mode, record);
      await refreshDossiers();
      showToast(isAr ? `تم حذف ${record.dossierCode}` : `Deleted ${record.dossierCode}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadBrief = async (record: SugarTaxDossierRecord) => {
    setBusyAction(`brief-${record.dossierCode}`);
    try {
      const md = await fetchBriefMarkdown(mode, record, locale);
      triggerFileDownload(
        `${record.dossierCode}.${locale}.brief.md`,
        md,
        'text/markdown;charset=utf-8',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Brief download failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadCsv = async (record: SugarTaxDossierRecord) => {
    setBusyAction(`csv-${record.dossierCode}`);
    try {
      const csv = await fetchExportCsv(mode, record);
      triggerFileDownload(`${record.dossierCode}.sku-audit.csv`, csv, 'text/csv;charset=utf-8');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'CSV export failed');
    } finally {
      setBusyAction(null);
    }
  };

  const navigatePublicReport = (slugOrCode: string) => {
    const nextUrl = withBase(`/r/${encodeURIComponent(slugOrCode)}`);
    window.history.pushState({}, '', nextUrl);
    setPublicSlugRoute(slugOrCode);
  };

  const navigateHome = () => {
    window.history.pushState({}, '', withBase('/'));
    setPublicSlugRoute(null);
  };

  const handleCopyPublicUrl = async (slugOrCode: string) => {
    const url = `${window.location.origin}${withBase(`/r/${encodeURIComponent(slugOrCode)}`)}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(isAr ? 'تم نسخ رابط التقرير المختوم' : 'Copied sealed report URL');
    } catch {
      showToast(url);
    }
  };

  const HeaderControls = (
    <div className="no-print flex flex-wrap items-center gap-2">
      <span
        data-testid="storage-mode-badge"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]"
      >
        <Database className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
        {mode === 'server' ? copy.modeServer : copy.modeLocal}
      </span>

      <button
        type="button"
        data-testid="locale-toggle"
        onClick={() => setLocale((l) => (l === 'ar' ? 'en' : 'ar'))}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
      >
        <Globe className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
        {copy.langSwitch}
      </button>

      <button
        type="button"
        data-testid="theme-toggle"
        onClick={() =>
          setTheme((t) => (t === 'palm-alabaster' ? 'excise-night' : 'palm-alabaster'))
        }
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
      >
        {theme === 'palm-alabaster' ? (
          <Moon className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-[var(--accent-amber)]" />
        )}
        {theme === 'palm-alabaster' ? copy.themeDark : copy.themeLight}
      </button>
    </div>
  );

  // Public Sealed Report Route (/r/:slugOrCode)
  if (publicSlugRoute) {
    const rep = publicReportState.data;
    return (
      <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <header className="sugar-card rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]">
                  <FileCheck2 className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-base font-extrabold text-[var(--text-primary)]">
                    {copy.publicSealTitle}
                  </h1>
                  <p className="sugar-mono text-xs text-[var(--text-secondary)]">
                    {publicSlugRoute}
                  </p>
                </div>
              </div>

              <div className="no-print flex flex-wrap items-center gap-2">
                {HeaderControls}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {copy.printPdf}
                </button>
                <button
                  type="button"
                  onClick={navigateHome}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-bold text-[var(--accent-primary-fg)]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {copy.backToStudio}
                </button>
              </div>
            </div>
          </header>

          {publicReportState.loading && (
            <div className="sugar-card rounded-2xl p-6 text-center text-sm text-[var(--text-secondary)]">
              {copy.loadingReport}
            </div>
          )}

          {publicReportState.error && (
            <div className="sugar-card rounded-2xl border border-[var(--accent-crimson)] bg-[var(--accent-crimson-soft)] p-5 text-sm font-semibold text-[var(--accent-crimson)]">
              {publicReportState.error}
            </div>
          )}

          {rep && (
            <div className="space-y-4">
              <section className="sugar-card space-y-3 rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sugar-mono rounded-lg bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-bold text-[var(--accent-teal)]">
                      {rep.report.dossierCode}
                    </span>
                    <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-bold">
                      {STATUS_LABELS[rep.report.status][locale]} · {rep.report.readinessScore}/100
                    </span>
                  </div>
                  <span
                    data-testid="public-view-count"
                    className="sugar-mono text-xs font-bold text-[var(--accent-primary)]"
                  >
                    {copy.viewsCount}: {rep.viewCount}
                  </span>
                </div>

                <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
                  {rep.report.organizationName}
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  TRN <span className="sugar-mono">{rep.report.trnNumber}</span> · {copy.sealedAt}{' '}
                  <span className="sugar-mono">{rep.report.lockedAt}</span>
                </p>
                <p className="sugar-mono break-all text-[11px] text-[var(--text-secondary)]">
                  {copy.shaDigest} {rep.report.dossierSha256}
                </p>

                <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3 text-xs">
                    <div className="text-[var(--text-secondary)]">
                      {isAr ? 'التعرفة المطبقة' : 'Applied Rate'}
                    </div>
                    <div className="sugar-mono mt-1 text-base font-bold">
                      {rep.report.tierEval.appliedRateAedPerL.toFixed(2)} AED/L
                    </div>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3 text-xs">
                    <div className="text-[var(--text-secondary)]">
                      {isAr ? 'ضريبة 2026 الحجمية' : '2026 Volumetric Excise'}
                    </div>
                    <div className="sugar-mono mt-1 text-base font-bold text-[var(--accent-primary)]">
                      {Math.round(rep.report.tierEval.volumetricExcise2026Aed).toLocaleString(
                        'en-US',
                      )}{' '}
                      AED
                    </div>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-3 text-xs">
                    <div className="text-[var(--text-secondary)]">
                      {isAr ? 'إجمالي التعرض (75/2023)' : 'Total Exposure (CD 75)'}
                    </div>
                    <div className="sugar-mono mt-1 text-base font-bold text-[var(--accent-crimson)]">
                      {Math.round(rep.report.exposure.totalFinancialExposureAed).toLocaleString(
                        'en-US',
                      )}{' '}
                      AED
                    </div>
                  </div>
                </div>
              </section>

              <section className="sugar-card rounded-2xl p-5">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-primary)]">
                  {isAr ? rep.report.briefAr : rep.report.briefEn}
                </pre>
              </section>

              <footer className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5 text-xs text-[var(--text-secondary)]">
                {isAr ? rep.report.legalDisclaimerAr : rep.report.legalDisclaimerEn}
              </footer>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="sugar-card rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] shadow-sm">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-extrabold text-[var(--text-primary)] sm:text-lg">
                    {copy.brandTitle}
                  </h1>
                  <span className="sugar-mono rounded-md bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-teal)]">
                    v{SUGARTAXAE_TOOL_VERSION}
                  </span>
                  <span
                    data-testid="status-badge"
                    className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-0.5 text-[11px] font-extrabold text-[var(--text-primary)]"
                  >
                    {STATUS_LABELS[liveResult.status][locale]} · {liveResult.readinessScore}/100
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {copy.brandSubtitle}
                </p>
              </div>
            </div>

            {HeaderControls}
          </div>

          <div className="no-print mt-4 border-t border-[var(--border-subtle)] pt-3">
            <div className="mb-2 text-xs font-bold text-[var(--text-secondary)]">
              {copy.presetsLabel}
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGAR_PRESETS.map((preset) => {
                const active = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`preset-${preset.id}`}
                    onClick={() => handleSelectPreset(preset.id)}
                    className="rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors"
                    style={{
                      borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                      backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                      color: active ? 'var(--accent-primary-fg)' : 'var(--text-primary)',
                    }}
                  >
                    {isAr ? preset.labelAr : preset.labelEn}
                  </button>
                );
              })}
            </div>
          </div>

          <nav className="no-print mt-4 flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-3">
            {(
              [
                ['dashboard', copy.tabs.dashboard],
                ['controls', copy.tabs.controls],
                ['csv', copy.tabs.csv],
                ['vault', copy.tabs.vault],
              ] as const
            ).map(([tabKey, tabLabel]) => {
              const active = activeTab === tabKey;
              return (
                <button
                  key={tabKey}
                  type="button"
                  data-testid={`tab-${tabKey}`}
                  onClick={() => setActiveTab(tabKey)}
                  className="rounded-xl border px-3.5 py-2 text-xs font-extrabold transition-colors"
                  style={{
                    borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    backgroundColor: active ? 'var(--bg-soft)' : 'var(--bg-surface)',
                    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {tabLabel}
                </button>
              );
            })}
          </nav>
        </header>

        {toast && (
          <div
            role="status"
            className="sugar-card no-print rounded-xl border border-[var(--accent-teal)] bg-[var(--accent-teal-soft)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)]"
          >
            {toast}
          </div>
        )}

        <main className="space-y-4">
          {activeTab === 'dashboard' && (
            <>
              <SugarTierAndMoIatSvg input={input} result={liveResult} locale={locale} />
              <BeverageAndExposurePanel
                input={input}
                result={liveResult}
                locale={locale}
                onChange={handleInputPatch}
              />
            </>
          )}

          {activeTab === 'controls' && (
            <ControlsAndFindingsPanel
              result={liveResult}
              implementedControls={input.implementedControls}
              locale={locale}
              onToggleControl={handleToggleControl}
              onSelectAllControls={() =>
                handleInputPatch({ implementedControls: SUGAR_CONTROLS.map((c) => c.id) })
              }
            />
          )}

          {activeTab === 'csv' && (
            <SkuCsvAuditPanel
              skuCsv={input.skuCsv || ''}
              locale={locale}
              onChangeCsv={(skuCsv) => handleInputPatch({ skuCsv })}
              onExportSafeCsv={(filename, content) =>
                triggerFileDownload(filename, content, 'text/csv;charset=utf-8')
              }
            />
          )}

          {activeTab === 'vault' && (
            <DossierVaultAndPrint
              dossiers={dossiers}
              liveResult={liveResult}
              locale={locale}
              busyAction={busyAction}
              onSaveDraft={handleSaveDraft}
              onFinalize={handleFinalize}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onDownloadBrief={handleDownloadBrief}
              onDownloadCsv={handleDownloadCsv}
              onOpenPublic={navigatePublicReport}
              onCopyPublicUrl={handleCopyPublicUrl}
            />
          )}
        </main>

        <footer
          data-testid="legal-disclaimer-banner"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-xs leading-relaxed text-[var(--text-secondary)]"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-amber)]" />
            <div>{isAr ? liveResult.legalDisclaimerAr : liveResult.legalDisclaimerEn}</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
