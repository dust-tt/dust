import { getPokeUserConfigBucket } from "@app/lib/file_storage";
import {
  getPokeRolesForUser,
  hasPokeRole,
  invalidateRolesCache,
  loadRolesForAuth,
  loadRolesWithGeneration,
  normalizeEmail,
  normalizeRolesConfig,
  POKE_ROLES_FILE,
  type RolesConfig,
  RolesConfigSchema,
  writeRoles,
} from "@app/lib/poke/roles";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

vi.mock("@app/logger/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

function seedRolesConfig(config: RolesConfig): void {
  fileStorageMock.reset();
  const bucket = fileStorageMock.mock().getPokeUserConfigBucket();
  bucket.uploadRawContentToBucket({
    content: JSON.stringify(config),
    contentType: "application/json",
    filePath: POKE_ROLES_FILE,
  });
}

describe("normalizeEmail", () => {
  beforeEach(() => invalidateRolesCache());

  it("lowercases email", () => {
    expect(normalizeEmail("USER@EXAMPLE.COM")).toBe("user@example.com");
  });

  it("trims whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("lowercases and trims combined", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
  });
});

describe("normalizeRolesConfig", () => {
  beforeEach(() => invalidateRolesCache());

  it("merges case-variant keys", () => {
    const config: RolesConfig = {
      "user@example.com": ["admin"],
      "USER@example.com": ["support"],
    };
    const result = normalizeRolesConfig(config);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result["user@example.com"]).toEqual(
      expect.arrayContaining(["admin", "support"])
    );
  });

  it("passes through clean config unchanged", () => {
    const config: RolesConfig = {
      "alice@example.com": ["admin", "engineering"],
      "bob@example.com": ["support"],
    };
    const result = normalizeRolesConfig(config);
    expect(result).toEqual(config);
  });
});

describe("hasPokeRole", () => {
  beforeEach(() => invalidateRolesCache());

  it("returns true when user has a required role", () => {
    expect(hasPokeRole(["admin", "support"], ["support"])).toBe(true);
  });

  it("returns false when user lacks all required roles", () => {
    expect(hasPokeRole(["admin"], ["support", "billing"])).toBe(false);
  });

  it("returns false for empty user roles", () => {
    expect(hasPokeRole([], ["admin"])).toBe(false);
  });

  it("returns false for empty required roles", () => {
    expect(hasPokeRole(["admin"], [])).toBe(false);
  });
});

describe("RolesConfigSchema", () => {
  beforeEach(() => invalidateRolesCache());

  it("accepts valid config", () => {
    const result = RolesConfigSchema.safeParse({
      "user@example.com": ["admin", "support"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email keys", () => {
    const result = RolesConfigSchema.safeParse({
      "not-an-email": ["admin"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid roles", () => {
    const result = RolesConfigSchema.safeParse({
      "user@example.com": ["nonexistent_role"],
    });
    expect(result.success).toBe(false);
  });
});

describe("loadRolesWithGeneration", () => {
  beforeEach(() => {
    invalidateRolesCache();
    fileStorageMock.reset();
  });

  it("parses GCS content and reads generation from metadata", async () => {
    const config: RolesConfig = {
      "user@example.com": ["admin"],
    };
    seedRolesConfig(config);
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "42",
    }));

    const result = await loadRolesWithGeneration();

    expect(result.roles).toEqual({ "user@example.com": ["admin"] });
    expect(result.generation).toBe(42);
  });

  it("normalizes result on load", async () => {
    const config: RolesConfig = {
      "USER@example.com": ["admin"],
      "user@example.com": ["support"],
    };
    seedRolesConfig(config);
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "1",
    }));

    const result = await loadRolesWithGeneration();

    expect(Object.keys(result.roles)).toHaveLength(1);
    expect(result.roles["user@example.com"]).toEqual(
      expect.arrayContaining(["admin", "support"])
    );
  });

  it("populates cache after load", async () => {
    const config: RolesConfig = { "user@example.com": ["admin"] };
    seedRolesConfig(config);
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "10",
    }));

    await loadRolesWithGeneration();

    const authResult = await loadRolesForAuth();
    expect(authResult).toEqual({ "user@example.com": ["admin"] });
  });
});

describe("loadRolesForAuth", () => {
  beforeEach(() => {
    invalidateRolesCache();
    fileStorageMock.reset();
  });

  it("returns cached roles when generation is unchanged", async () => {
    const config: RolesConfig = { "user@example.com": ["admin"] };
    seedRolesConfig(config);
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "5",
    }));

    await loadRolesWithGeneration();

    fileStorageMock.reset();
    seedRolesConfig({ "other@example.com": ["support"] });
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "5",
    }));

    const result = await loadRolesForAuth();
    expect(result).toEqual({ "user@example.com": ["admin"] });
  });

  it("re-downloads when generation changes", async () => {
    const config: RolesConfig = { "user@example.com": ["admin"] };
    seedRolesConfig(config);
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "5",
    }));

    await loadRolesWithGeneration();

    fileStorageMock.reset();
    const newConfig: RolesConfig = { "other@example.com": ["support"] };
    seedRolesConfig(newConfig);
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "6",
    }));

    const result = await loadRolesForAuth();
    expect(result).toEqual({ "other@example.com": ["support"] });
  });

  it("refreshes authorization roles when the object generation changes", async () => {
    seedRolesConfig({ "user@example.com": ["admin"] });
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "5",
    }));

    expect(await getPokeRolesForUser("USER@example.com")).toEqual(["admin"]);

    fileStorageMock.reset();
    seedRolesConfig({ "other@example.com": ["support"] });
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "6",
    }));

    expect(await getPokeRolesForUser("user@example.com")).toEqual([]);
  });
});

describe("writeRoles", () => {
  beforeEach(() => {
    invalidateRolesCache();
    fileStorageMock.reset();
  });

  it("stores normalized JSON on successful write", async () => {
    const config: RolesConfig = { "user@example.com": ["admin"] };

    const result = await writeRoles(config, 1);

    expect(result.isOk()).toBe(true);
    const stored = fileStorageMock.getObject(POKE_ROLES_FILE);
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed).toEqual({ "user@example.com": ["admin"] });
  });

  it("returns conflict error on precondition failure", async () => {
    fileStorageMock.setPreconditionFails(() => true);

    const config: RolesConfig = { "user@example.com": ["admin"] };
    const result = await writeRoles(config, 1);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("conflict");
    }
  });

  it("returns validation error on invalid config", async () => {
    const invalidConfig = { "not-an-email": ["admin"] } as RolesConfig;
    const result = await writeRoles(invalidConfig, 1);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("validation_error");
    }
  });

  it("returns storage error on non-412 failure", async () => {
    const mockBucket = (getPokeUserConfigBucket as Mock)();
    mockBucket.uploadRawContentToBucketWithPrecondition.mockRejectedValueOnce(
      new Error("Network timeout")
    );
    (getPokeUserConfigBucket as Mock).mockReturnValueOnce(mockBucket);

    const config: RolesConfig = { "user@example.com": ["admin"] };
    const result = await writeRoles(config, 1);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("storage_error");
    }
  });

  it("invalidates cache after successful write", async () => {
    const config: RolesConfig = { "user@example.com": ["admin"] };
    seedRolesConfig(config);
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "1",
    }));

    await loadRolesWithGeneration();

    const newConfig: RolesConfig = { "other@example.com": ["support"] };
    await writeRoles(newConfig, 1);

    fileStorageMock.reset();
    seedRolesConfig({ "other@example.com": ["support"] });
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "2",
    }));

    const reloaded = await loadRolesWithGeneration();
    expect(reloaded.roles).toEqual({ "other@example.com": ["support"] });
  });
});

describe("development roles store", () => {
  beforeEach(() => {
    invalidateRolesCache();
    fileStorageMock.reset();
    vi.stubEnv("IS_DEVELOPMENT", "true");
    vi.stubEnv("DUST_POKE_USER_CONFIG_BUCKET", "");
  });

  it("supports versioned reads and writes without GCS", async () => {
    const initial = await loadRolesWithGeneration();
    expect(initial).toEqual({ roles: {}, generation: 0 });

    const writeResult = await writeRoles(
      { "user@example.com": ["admin"] },
      initial.generation
    );
    expect(writeResult.isOk()).toBe(true);

    const updated = await loadRolesWithGeneration();
    expect(updated).toEqual({
      roles: { "user@example.com": ["admin"] },
      generation: 1,
    });

    const staleWrite = await writeRoles(
      { "other@example.com": ["support"] },
      initial.generation
    );
    expect(staleWrite.isErr()).toBe(true);
    if (staleWrite.isErr()) {
      expect(staleWrite.error.type).toBe("conflict");
    }
    expect(getPokeUserConfigBucket).not.toHaveBeenCalled();
  });
});

describe("writeRoles non-mutation (GEN5)", () => {
  beforeEach(() => {
    invalidateRolesCache();
    fileStorageMock.reset();
  });

  it("does not mutate the input config", async () => {
    const config: RolesConfig = {
      "alice@example.com": ["admin", "engineering"],
      "bob@example.com": ["support"],
    };
    const original = JSON.parse(JSON.stringify(config));

    await writeRoles(config, 1);

    expect(config).toEqual(original);
  });
});

describe("invalidateRolesCache", () => {
  beforeEach(() => {
    invalidateRolesCache();
    fileStorageMock.reset();
  });

  it("forces next load to re-fetch from storage", async () => {
    const config: RolesConfig = { "user@example.com": ["admin"] };
    seedRolesConfig(config);
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "1",
    }));

    await loadRolesWithGeneration();

    invalidateRolesCache();

    fileStorageMock.reset();
    const newConfig: RolesConfig = { "new@example.com": ["billing"] };
    seedRolesConfig(newConfig);
    fileStorageMock.setFileMetadata(() => ({
      contentType: "application/json",
      size: "100",
      generation: "1",
    }));

    const result = await loadRolesForAuth();
    expect(result).toEqual({ "new@example.com": ["billing"] });
  });
});
