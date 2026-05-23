import type { Page, TestInfo } from '@playwright/test';

export interface PageEvidence {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
}

export function installPageEvidence(page: Page): PageEvidence {
  const evidence: PageEvidence = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      evidence.consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    evidence.pageErrors.push(error.message);
  });

  page.on('requestfailed', (request) => {
    evidence.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown error'}`);
  });

  page.on('response', async (response) => {
    if (response.status() >= 400) {
      evidence.requestFailures.push(`${response.request().method()} ${response.url()} :: HTTP ${response.status()}`);
    }
  });

  return evidence;
}

export async function attachPageEvidence(
  page: Page,
  testInfo: TestInfo,
  evidence: PageEvidence,
): Promise<void> {
  const shouldAttach = testInfo.status !== testInfo.expectedStatus;
  if (!shouldAttach) return;

  await testInfo.attach('page-evidence.json', {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(evidence, null, 2), 'utf8'),
  });

  await testInfo.attach('page-url.txt', {
    contentType: 'text/plain',
    body: Buffer.from(page.url(), 'utf8'),
  });

  await testInfo.attach('page-dom.html', {
    contentType: 'text/html',
    body: Buffer.from(await page.content(), 'utf8'),
  });
}

export async function captureCheckpoint(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(`${name}.png`, {
    contentType: 'image/png',
    body: await page.screenshot({ fullPage: true }),
  });
}
