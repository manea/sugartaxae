# Changelog — SugarTaxAE

## [0.5.0] - 2026-11-25
### Added
- Public MIT open-source release (`LICENSE`), GitHub Actions CI workflow (`.github/workflows/ci.yml`), and embedded desktop/mobile Chrome QA screenshot showcase (`docs/screenshots/`) in `README.md`.

## [0.4.0] - 2026-11-25
### Added
- Playwright headless Chromium end-to-end verification suite (`playwright.config.ts`, `tests/e2e/sugartaxae.spec.ts`) covering desktop (`1280x800`) and mobile (`390x844`) responsive checks across `AR RTL Palm Alabaster` and `EN LTR Excise Night`, full preset remediation to `100/100`, atomic `EX-2026-0001` sealing, wire-level `UTF-8 BOM` CSV downloads, and persistent `/r/:code` public report views.
- `$0` static hosting and self-hosted deployment bundle (`wrangler.jsonc`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `deploy/*`, `launch/DEPLOY-AND-SHARE.md`, `README.md`) plus automated privacy export sanitizer.

### Fixed
- Eliminated Arabic BiDi angle-bracket/arrow reversal in preset pills, KPI rate display (`د.إ/لتر`), and SVG tier telemetry headers verified via 6 live Chrome screenshots.

## [0.3.0] - 2026-11-25
### Added
- Bilingual (`AR RTL / EN LTR`) React 19 + Tailwind CSS v4 Web Studio (`Palm Alabaster` light default + `Excise Night` dark mode) with `vite.config.ts` on `:4238` proxying API/health requests to `:4237`.
- Interactive volumetric SVG telemetry (`SugarTierAndMoIatSvg.tsx`) visualizing the 3 Cabinet Decision 197/2025 tiers (`0 / 0.79 / 1.09 AED/L`), legacy `50%` vs `2026` excise comparison, `MoIAT ISO 17025 / ECAS` gate, EmaraTax `EX201 Day-15` deadline, and reformulation annual savings.
- Dedicated panels (`BeverageAndExposurePanel.tsx`, `ControlsAndFindingsPanel.tsx`, `SkuCsvAuditPanel.tsx`, `DossierVaultAndPrint.tsx`) + `src/lib/{basePath,i18n,api}.ts` supporting dual-mode (`SQLite WAL` or `$0 localStorage`) persistence, safe `UTF-8 BOM` CSV downloads, `A4 PDF` print layout, and public `/r/:slugOrCode` report viewing.

## [0.2.0] - 2026-11-25
### Added
- Bilingual Markdown brief builder (`src/core/briefBuilder.ts`) summarizing tiered volumetric calculations, MoIAT ISO 17025 lab status, reformulation savings, financial exposure, 6 compliance controls, and multi-SKU CSV audit rows.
- Zero-dependency Node 22 SQLite WAL persistence layer (`server/db.mjs`) with transactional `EX-YYYY-0001` atomic dossier numbering and public report view tracking.
- Native `node:http` REST & static server (`server/app.mjs`, `server/index.mjs`, `server/app.d.mts`) on default port `:4237` with `BASE_PATH=/sugartaxae` prefix stripping, `window.__SUGARTAXAE_BASE__` injection, `409 DOSSIER_LOCKED / ALREADY_LOCKED` sealing immutability, `413` body cap, `429` rate limit (`/health` and `/readyz` exempt), `/api/audit-csv`, `/api/export/sku-csv`, and `UTF-8 BOM` + `CWE-1236` safe CSV export.
- Server integration test suite (`tests/unit/sugarTaxServer.test.ts`).

## [0.1.0] - 2026-11-25
### Added
- Initial zero-dependency (`dependencies: {}`) UAE Tiered Volumetric Sweetened Beverages Excise Tax readiness core (`src/core/*`) modeled on Cabinet Decision No. (197) of 2025 (effective 2026-01-01) and FTA Decision No. (10) of 2025.
- Sugar-tier rate engine (`>=8g -> 1.09 AED/L`, `5g–<8g -> 0.79 AED/L`, `<5g / artificial-only -> 0 AED/L`), `100%` energy-drink classification, `>=75%` dairy and 100% natural juice exemptions, concentrate/powder reconstituted volume calculator, strict `1.09 AED/L` default rule when `MoIAT` ISO 17025 lab verification is absent, and reformulation savings simulator.
- EmaraTax `EX201` `15th`-day return deadline calculator, MoIAT-missing overpayment & `CD 75/2023` recordkeeping exposure estimator, `CWE-1236` + `UTF-8 BOM` SKU CSV auditor/exporter, 3 UAE presets, deterministic `SHA-256` digest, and explicit Non-FTA/Non-MoIAT/Non-MoF disclaimers.
