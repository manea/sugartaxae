import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.mjs';
import { SUGARTAXAE_TOOL_VERSION, SUGAR_PRESETS } from '../../src/core/index.ts';

const createdServers: Array<{ close: () => Promise<void> }> = [];
const tempDirs: string[] = [];

async function startTempApp(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugartaxae-test-'));
  tempDirs.push(dir);
  const app = createApp({ dataDir: dir, ...options });
  const bound = await app.listen(0, '127.0.0.1');
  createdServers.push(app);
  return { app, url: bound.url, dir };
}

afterEach(async () => {
  while (createdServers.length > 0) {
    const inst = createdServers.pop();
    if (inst) await inst.close();
  }
  while (tempDirs.length > 0) {
    const d = tempDirs.pop();
    if (d) fs.rmSync(d, { recursive: true, force: true });
  }
});

describe('SugarTaxAE SQLite WAL server & HTTP API (v0.2.0)', () => {
  it('serves /health, /readyz WAL mode, and /api/presets with explicit disclaimers', async () => {
    const { url } = await startTempApp();

    const healthRes = await fetch(`${url}/health`);
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as { ok: boolean; service: string; version: string };
    expect(health.ok).toBe(true);
    expect(health.service).toBe('sugartaxae');
    expect(health.version).toBe(SUGARTAXAE_TOOL_VERSION);

    const readyRes = await fetch(`${url}/readyz`);
    expect(readyRes.status).toBe(200);
    const ready = (await readyRes.json()) as { ready: boolean; journalMode: string };
    expect(ready.ready).toBe(true);
    expect(ready.journalMode).toBe('wal');

    const presetsRes = await fetch(`${url}/api/presets`);
    expect(presetsRes.status).toBe(200);
    const presetsData = (await presetsRes.json()) as {
      toolName: string;
      presets: unknown[];
      controls: unknown[];
      legalDisclaimerEn: string;
      legalDisclaimerAr: string;
    };
    expect(presetsData.toolName).toBe('SugarTaxAE');
    expect(presetsData.presets).toHaveLength(3);
    expect(presetsData.controls).toHaveLength(6);
    expect(presetsData.legalDisclaimerEn).toContain('NOT affiliated');
    expect(presetsData.legalDisclaimerAr).toContain('ليست تابعة أو معتمدة');
  });

  it('computes tiered rates, penalty exposure, CSV audit, /api/export/sku-csv, and full assessment endpoints', async () => {
    const { url } = await startTempApp();

    const tierRes = await fetch(`${url}/api/evaluate-tier`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ presetId: SUGAR_PRESETS[1]!.id }),
    });
    expect(tierRes.status).toBe(200);
    const tierData = (await tierRes.json()) as {
      tierEval: {
        appliedRateAedPerL: number;
        volumetricExcise2026Aed: number;
        reformulationAnnualSavingsAed: number;
        emaraTaxReturnDueDate: string;
      };
    };
    expect(tierData.tierEval.appliedRateAedPerL).toBe(0.79);
    expect(tierData.tierEval.volumetricExcise2026Aed).toBe(158_000);
    expect(tierData.tierEval.reformulationAnnualSavingsAed).toBe(158_000);
    expect(tierData.tierEval.emaraTaxReturnDueDate).toBe('2026-02-15');

    const expRes = await fetch(`${url}/api/exposure`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ presetId: SUGAR_PRESETS[2]!.id }),
    });
    expect(expRes.status).toBe(200);
    const expData = (await expRes.json()) as {
      exposure: {
        moIatOverpaymentPenaltyAed: number;
        docRecordPenaltyAed: number;
        totalFinancialExposureAed: number;
      };
    };
    expect(expData.exposure.moIatOverpaymentPenaltyAed).toBe(54_500);
    expect(expData.exposure.docRecordPenaltyAed).toBe(20_000);
    expect(Math.round(expData.exposure.totalFinancialExposureAed)).toBe(78_315);

    const csvRes = await fetch(`${url}/api/audit-csv`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv: SUGAR_PRESETS[2]!.input.skuCsv }),
    });
    expect(csvRes.status).toBe(200);
    const csvData = (await csvRes.json()) as {
      audit: { totalRows: number; blockedCount: number; formulaSanitizedCount: number };
      exportedCsv: string;
    };
    expect(csvData.audit.totalRows).toBe(2);
    expect(csvData.audit.blockedCount).toBe(1);
    expect(csvData.audit.formulaSanitizedCount).toBe(1);
    expect(csvData.exportedCsv.startsWith('\uFEFF')).toBe(true);
    expect(csvData.exportedCsv).toContain("'=HYPERLINK");

    const wireCsvRes = await fetch(`${url}/api/export/sku-csv`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv: SUGAR_PRESETS[2]!.input.skuCsv }),
    });
    expect(wireCsvRes.status).toBe(200);
    expect(wireCsvRes.headers.get('content-type')).toContain('text/csv');
    const wireCsvBuf = Buffer.from(await wireCsvRes.arrayBuffer());
    expect(Array.from(wireCsvBuf.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(wireCsvBuf.toString('utf8')).toContain("'=HYPERLINK");

    const assessRes = await fetch(`${url}/api/assess`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ presetId: SUGAR_PRESETS[2]!.id }),
    });
    expect(assessRes.status).toBe(200);
    const assessData = (await assessRes.json()) as {
      result: { status: string; readinessScore: number; dossierSha256: string };
    };
    expect(assessData.result.status).toBe('blocked');
    expect(assessData.result.readinessScore).toBe(0);
    expect(assessData.result.dossierSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('persists profiles & dossiers, enforces 409 lock immutability, exports BOM CSV & AR/EN brief, and increments public views', async () => {
    const { url } = await startTempApp();

    const profRes = await fetch(`${url}/api/profiles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        organizationName: 'KIZAD Beverage Imports LLC',
        trnNumber: '100889234100003',
        beverageCategory: 'sweetened_beverage',
        productFormat: 'liquid_concentrate',
        taxPeriodEndDate: '2026-12-31',
      }),
    });
    expect(profRes.status).toBe(201);
    const profData = (await profRes.json()) as { profile: { id: number } };

    const createRes = await fetch(`${url}/api/dossiers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profileId: profData.profile.id,
        input: SUGAR_PRESETS[2]!.input,
        title: 'KIZAD Syrup Concentrate FY2026 Excise Audit',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { item: { dossierCode: string; status: string } };
    expect(created.item.dossierCode).toBe('EX-2026-0001');
    expect(created.item.status).toBe('blocked');

    const dupRes = await fetch(`${url}/api/dossiers/${created.item.dossierCode}/duplicate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(dupRes.status).toBe(201);
    const dup = (await dupRes.json()) as { item: { dossierCode: string } };
    expect(dup.item.dossierCode).toBe('EX-2026-0002');

    const delDupRes = await fetch(`${url}/api/dossiers/${dup.item.dossierCode}`, {
      method: 'DELETE',
    });
    expect(delDupRes.status).toBe(200);

    const finalizeRes = await fetch(`${url}/api/dossiers/${created.item.dossierCode}/finalize`, {
      method: 'POST',
    });
    expect(finalizeRes.status).toBe(200);
    const finalized = (await finalizeRes.json()) as {
      item: { lockedAt: string; publicSlug: string };
    };
    expect(finalized.item.lockedAt).toBeTruthy();
    expect(finalized.item.publicSlug).toMatch(/^ex-[a-f0-9]{12}$/);

    const lockedPatch = await fetch(`${url}/api/dossiers/${created.item.dossierCode}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Attempted Tamper' }),
    });
    expect(lockedPatch.status).toBe(409);

    const lockedDelete = await fetch(`${url}/api/dossiers/${created.item.dossierCode}`, {
      method: 'DELETE',
    });
    expect(lockedDelete.status).toBe(409);

    const relockRes = await fetch(`${url}/api/dossiers/${created.item.dossierCode}/lock`, {
      method: 'POST',
    });
    expect(relockRes.status).toBe(409);

    const briefArRes = await fetch(
      `${url}/api/dossiers/${created.item.dossierCode}/brief.md?lang=ar`,
    );
    expect(briefArRes.status).toBe(200);
    expect(await briefArRes.text()).toContain('المشروبات المحلاة المتدرجة الإماراتية');

    const csvDlRes = await fetch(`${url}/api/dossiers/${created.item.dossierCode}/export.csv`);
    expect(csvDlRes.status).toBe(200);
    const csvBuf = Buffer.from(await csvDlRes.arrayBuffer());
    expect(Array.from(csvBuf.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(csvBuf.toString('utf8')).toContain("'=HYPERLINK");

    const pub1 = await fetch(`${url}/api/public/reports/${finalized.item.publicSlug}`);
    expect(pub1.status).toBe(200);
    const pub1Json = (await pub1.json()) as { viewCount: number; report: { briefEn: string } };
    expect(pub1Json.viewCount).toBe(1);
    expect(pub1Json.report.briefEn).toContain('EmaraTax EX201');

    const pub2 = await fetch(`${url}/api/public/reports/${created.item.dossierCode}`);
    expect(pub2.status).toBe(200);
    expect(((await pub2.json()) as { viewCount: number }).viewCount).toBe(2);
  });

  it('supports BASE_PATH=/sugartaxae prefix stripping and HTML base tag injection', async () => {
    const { url } = await startTempApp({ basePath: '/sugartaxae' });

    const htmlRes = await fetch(`${url}/`);
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();
    expect(html).toContain('window.__SUGARTAXAE_BASE__="/sugartaxae"');

    const hRes = await fetch(`${url}/health`);
    expect(hRes.status).toBe(200);
    expect(((await hRes.json()) as { basePath: string }).basePath).toBe('/sugartaxae');
  });

  it('enforces 413 body limit and 429 API rate limit while exempting /health and /readyz', async () => {
    const { url } = await startTempApp({ maxBodyBytes: 128, rateLimitMax: 2 });

    const bigRes = await fetch(`${url}/api/assess`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationName: 'X'.repeat(300) }),
    });
    expect(bigRes.status).toBe(413);

    expect((await fetch(`${url}/api/presets`)).status).toBe(200);
    expect((await fetch(`${url}/api/presets`)).status).toBe(429);

    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect((await fetch(`${url}/readyz`)).status).toBe(200);
  });
});
