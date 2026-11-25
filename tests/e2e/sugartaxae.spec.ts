import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function assertNoHorizontalOverflow(page: Page) {
  const dims = await page.evaluate(() => {
    const main = document.querySelector('main');
    const header = document.querySelector('header');
    const mainRect = main?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      mainWidth: mainRect ? Math.ceil(mainRect.width) : 0,
      headerWidth: headerRect ? Math.ceil(headerRect.width) : 0,
    };
  });
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.innerWidth);
  expect(dims.mainWidth).toBeLessThanOrEqual(dims.innerWidth);
  expect(dims.headerWidth).toBeLessThanOrEqual(dims.innerWidth);
}

function buildCleanSkuCsv(): string {
  return [
    'sku_code,product_name,beverage_category,product_format,sugar_g_per_100ml,base_units_or_litres,reconstitution_ratio,moiat_certified,retail_price_aed_per_l',
    'AUH-SYR-01,Tropical Mango Syrup Certified,sweetened_beverage,liquid_concentrate,4.2,10000,5,true,6',
    'AUH-DAIRY-02,Al Ain Date Milk 80%,milk_dairy_75plus,ready_to_drink,6.5,20000,1,true,12',
  ].join('\n');
}

test.describe('SugarTaxAE — UAE Cabinet Decision 197/2025 & FTA 10/2025 E2E', () => {
  test('defaults to AR RTL Palm Alabaster, toggles EN LTR Excise Night, and persists across reload', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.locator('header')).toContainText('SQLite WAL');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'palm-alabaster');
    await expect(page.locator('svg[role="img"]').first()).toBeVisible();
    await expect(page.getByTestId('status-badge')).toContainText('100/100');
    await expect(page.getByTestId('legal-disclaimer-banner')).toContainText('ليست تابعة أو معتمدة');
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/01-workspace-ar-palm-alabaster.png',
      fullPage: true,
      animations: 'disabled',
    });

    await page.getByTestId('locale-toggle').click();
    await page.getByTestId('theme-toggle').click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'excise-night');
    await expect(page.getByTestId('legal-disclaimer-banner')).toContainText('NOT affiliated');
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/02-workspace-en-excise-night.png',
      fullPage: true,
      animations: 'disabled',
    });

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'excise-night');

    expect(errors).toEqual([]);
  });

  test('evaluates Preset 1/2/3 & remediates Preset 3 into sealed EX-2026-0001 with BOM CSV & /r/:code', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const expectedCode = 'EX-2026-0001';

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByTestId('locale-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Preset 1: Dubai Low Sugar (<5g -> 0 AED/L Ready 100/100)
    await page.getByTestId('preset-dubai-low-sugar-zero-tier-ready').click();
    await expect(page.getByTestId('status-badge')).toContainText('Ready (EX201) · 100/100');

    // Preset 2: Sharjah Mid Sugar (6.4g -> 0.79 AED/L Conditional 85/100)
    await page.getByTestId('preset-sharjah-bottler-mid-tier-conditional').click();
    await expect(page.getByTestId('status-badge')).toContainText('Conditional · 85/100');
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/03-sharjah-conditional-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });

    // Preset 3: Abu Dhabi Concentrate No MoIAT Lab (-> 1.09 Default Blocked 0/100)
    await page.getByTestId('preset-abudhabi-concentrate-no-lab-blocked').click();
    await expect(page.getByTestId('status-badge')).toContainText('Blocked (1.09 Default) · 0/100');

    // Remediate Preset 3: verify MoIAT Lab Report, ECAS Cert, Dilution sheet, EmaraTax & zero late months
    await page.getByTestId('toggle-moiat-lab').check();
    await page.getByTestId('toggle-moiat-cert').check();
    await page.getByTestId('toggle-dilution-proof').check();
    await page.getByTestId('toggle-emaratax-reg').check();
    await page.getByTestId('late-months-input').fill('0');

    // Check all 6 controls on Controls tab
    await page.getByTestId('tab-controls').click();
    await page.getByTestId('select-all-controls-btn').click();

    // Replace uncertified & CWE-1236 payload CSV on CSV tab
    await page.getByTestId('tab-csv').click();
    await page.getByTestId('csv-textarea').fill(buildCleanSkuCsv());

    await expect(page.getByTestId('status-badge')).toContainText('Ready (EX201) · 100/100');

    // Vault tab: save -> seal -> download raw wire UTF-8 BOM CSV -> screenshot
    await page.getByTestId('tab-vault').click();
    await page.getByTestId('save-draft-btn').click();
    await expect(page.locator('main')).toContainText(expectedCode);

    await page.getByTestId(`finalize-${expectedCode}`).click();
    await expect(page.getByTestId(`finalize-${expectedCode}`)).toHaveCount(0);
    await expect(page.getByTestId(`public-link-${expectedCode}`)).toBeVisible();

    const dlPromise = page.waitForEvent('download');
    await page.getByTestId(`export-csv-${expectedCode}`).click();
    const dl = await dlPromise;
    expect(dl.suggestedFilename()).toContain('.csv');
    const dlPath = await dl.path();
    expect(dlPath).toBeTruthy();
    if (dlPath) {
      const bytes = fs.readFileSync(dlPath);
      expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    }

    await page.screenshot({
      path: 'test-results/qa-screenshots/04-sealed-dossier-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });

    // Public report route /r/:code & persistent view counter across reload
    await page.getByTestId(`public-link-${expectedCode}`).click();
    await expect(page.locator('body')).toContainText(expectedCode);
    await expect(page.locator('body')).toContainText('KIZAD Beverage Imports LLC');
    await expect(page.getByTestId('public-view-count')).toContainText('1');

    await page.reload();
    await expect(page.locator('body')).toContainText(expectedCode);
    await expect(page.getByTestId('public-view-count')).toContainText('2');

    expect(errors).toEqual([]);
  });

  test('verifies mobile 390x844 responsiveness in AR Palm Alabaster and EN Excise Night with zero overflow', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('svg[role="img"]').first()).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/05-mobile-ar-palm-alabaster.png',
      fullPage: true,
      animations: 'disabled',
    });

    await page.getByTestId('locale-toggle').click();
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'excise-night');
    await assertNoHorizontalOverflow(page);

    await page.screenshot({
      path: 'test-results/qa-screenshots/06-mobile-en-excise-night.png',
      fullPage: true,
      animations: 'disabled',
    });

    expect(errors).toEqual([]);
  });
});
