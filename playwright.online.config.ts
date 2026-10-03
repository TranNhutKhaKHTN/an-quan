import { defineConfig, devices } from "@playwright/test";

/**
 * Online-room E2E. Runs the real Next.js app (routes, Zod, GameService) with an in-memory
 * store and a browser-side fake of Supabase Auth/Realtime, so no Supabase project is needed.
 * Built into .next-e2e so it never fights with a running `next dev`.
 */
const port = 3200;
const env = [
  "NEXT_DIST_DIR=.next-e2e",
  "NEXT_PUBLIC_SUPABASE_URL=http://fake-supabase.test",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=fake-anon-key-for-e2e-tests",
  "SUPABASE_SERVICE_ROLE_KEY=fake-service-role-key",
  "E2E_FAKE_BACKEND=1",
  "NEXT_PUBLIC_ENABLE_ONLINE_ROOMS=true",
].join(" ");

export default defineConfig({
  testDir: "./e2e-online",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${port}`, reducedMotion: "reduce", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `${env} sh -c "npx next build && npx next start -p ${port}"`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
