import { defineConfig, devices } from "@playwright/test";

// Browser e2e against the LIVE stack:
//   backend  → docker compose up   (web :8000)
//   frontend → cd frontend && npm run dev -- --host --port 3001
// then:       cd e2e && npm install && npx playwright install chromium && npm test
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
