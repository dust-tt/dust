import {
  loadRolesForEditing,
  normalizeEmail,
  POKE_ROLES_FILE,
  type RolesConfig,
  writeRoles,
} from "@app/lib/poke/roles";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function seed(config: unknown) {
  fileStorageMock
    .mock()
    .getPokeUserConfigBucket()
    .uploadRawContentToBucket({
      content: JSON.stringify(config),
      contentType: "application/json",
      filePath: POKE_ROLES_FILE,
    });
}

describe("poke roles JSON storage", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes email addresses", () => {
    expect(normalizeEmail("  User@Dust.TT ")).toBe("user@dust.tt");
  });

  it("reads and validates the current JSON object", async () => {
    seed({ "User@Dust.TT": ["admin", "support"] });

    await expect(loadRolesForEditing()).resolves.toEqual({
      "user@dust.tt": ["admin", "support"],
    });
  });

  it("rejects invalid role JSON", async () => {
    seed({ "user@dust.tt": ["not-a-role"] });

    await expect(loadRolesForEditing()).rejects.toThrow();
  });

  it("validates and overwrites the JSON object", async () => {
    const roles: RolesConfig = {
      "user@dust.tt": ["admin"],
      "support@dust.tt": ["support"],
    };

    await writeRoles(roles);

    await expect(loadRolesForEditing()).resolves.toEqual(roles);
  });

  it("supports local development without a GCS bucket", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DUST_POKE_USER_CONFIG_BUCKET", "");

    await writeRoles({ "local@dust.tt": ["admin"] });

    await expect(loadRolesForEditing()).resolves.toEqual({
      "local@dust.tt": ["admin"],
    });
  });
});
