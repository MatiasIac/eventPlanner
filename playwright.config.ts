import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 40000,
  reporter: [['list'], ['html', { outputFolder: 'test-results/report', open: 'never' }]],
  outputDir: 'test-results/browser',
  use: { baseURL: 'http://127.0.0.1:8888', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run start:docker', url: 'http://127.0.0.1:8888/api/health', reuseExistingServer: false, timeout: 30000 },
});
