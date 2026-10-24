import { describe, expect, test } from "bun:test";
import { resolveConfig } from "vite";
import path from "node:path";
import { isTestPath, shouldConfirmTestExit } from "../src/native/navigation";

describe("Mobile feature resolution", () => {
  test("native integrations override shared modules while statistics and database remain shared", async () => {
    const root = path.resolve(import.meta.dir, "..");
    const config = await resolveConfig({ root, configFile: path.join(root, "vite.config.ts") }, "serve");
    const resolve = config.createResolver();
    for (const [specifier, destination] of [
      ["@/components/TestTimer", "mobile/src/overrides/TestTimer.tsx"],
      ["@/integrations/supabase/client", "mobile/src/overrides/supabaseClient.ts"],
      ["@/lib/pdfGenerator", "mobile/src/overrides/pdfGenerator.ts"],
      ["@/components/admin/AnalyticsDashboard", "src/components/admin/AnalyticsDashboard.tsx"],
      ["@/components/admin/DatabaseDashboard", "src/components/admin/DatabaseDashboard.tsx"],
    ]) {
      expect(await resolve(specifier)).toBe(path.resolve(root, "..", destination));
    }
    expect(config.envDir).toBe(path.resolve(root, ".."));
  });
});

describe("Mobile exam exit protection", () => {
  test("leaving the active test requires confirmation", () => {
    expect(shouldConfirmTestExit("/test/paper-1", "/dashboard")).toBe(true);
    expect(shouldConfirmTestExit("/test/paper-1", "/test/paper-2")).toBe(true);
  });
  test("submitted results and entering a test do not trigger exit confirmation", () => {
    expect(shouldConfirmTestExit("/test/paper-1", "/results/attempt-1")).toBe(false);
    expect(shouldConfirmTestExit("/dashboard", "/test/paper-1")).toBe(false);
    expect(isTestPath("/test/paper-1")).toBe(true);
    expect(isTestPath("/results/attempt-1")).toBe(false);
  });
});

test("offline answers remain queued without acknowledged persistence", async () => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } });
  const { offlineSync } = await import("../src/native/offlineSync");
  offlineSync.queueAnswer("attempt-1", "question-1", "a");
  expect(await offlineSync.flushQueue()).toEqual({ synced: 0, failed: 0 });
  expect(offlineSync.getQueue()).toHaveLength(1);
  offlineSync.setSyncHandler(async () => { throw new Error("Rejected"); });
  expect(await offlineSync.flushQueue()).toEqual({ synced: 0, failed: 1 });
  expect(offlineSync.getQueue()[0].selectedOption).toBe("a");
});