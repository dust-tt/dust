import { vi } from "vitest";

type ConfigModule = typeof import("@app/lib/api/config");
export type AppConfig = ConfigModule["default"];
export type AppConfigMockOverrides = Partial<{
  [K in keyof AppConfig]: AppConfig[K];
}>;

/**
 * Merge config getter overrides onto the real config module.
 * Use inside vi.mock("@app/lib/api/config", async (importOriginal) => ...).
 *
 * Preserves all unmocked getters (required when honoApp loads MCP routes).
 */
export async function createAppConfigMock(
  importOriginal: <T = ConfigModule>() => Promise<T>,
  overrides: AppConfigMockOverrides = {}
): Promise<ConfigModule> {
  const actual = await importOriginal<ConfigModule>();
  const mocked: Record<string, unknown> = { ...actual.default };

  for (const [key, value] of Object.entries(overrides) as [string, unknown][]) {
    mocked[key] =
      typeof value === "function"
        ? vi.fn(value as (...args: never[]) => unknown)
        : value;
  }

  return {
    ...actual,
    default: mocked as AppConfig,
  };
}
