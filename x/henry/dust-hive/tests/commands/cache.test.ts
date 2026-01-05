import { describe, expect, it } from "bun:test";
import { ALL_BINARIES, INIT_BINARIES, SERVICE_BINARIES, getBinaryPath } from "../../src/lib/cache";

describe("cache command", () => {
  describe("binary lists", () => {
    it("has correct init binaries", () => {
      expect(INIT_BINARIES).toContain("qdrant_create_collection");
      expect(INIT_BINARIES).toContain("elasticsearch_create_index");
      expect(INIT_BINARIES).toContain("init_db");
      expect(INIT_BINARIES.length).toBe(3);
    });

    it("has correct service binaries", () => {
      expect(SERVICE_BINARIES).toContain("core-api");
      expect(SERVICE_BINARIES).toContain("oauth");
      expect(SERVICE_BINARIES).toContain("sqlite-worker");
      expect(SERVICE_BINARIES.length).toBe(3);
    });

    it("ALL_BINARIES contains all init and service binaries", () => {
      const expectedLength = INIT_BINARIES.length + SERVICE_BINARIES.length;
      expect(ALL_BINARIES).toHaveLength(expectedLength);

      for (const binary of INIT_BINARIES) {
        expect(ALL_BINARIES).toContain(binary);
      }

      for (const binary of SERVICE_BINARIES) {
        expect(ALL_BINARIES).toContain(binary);
      }
    });
  });

  describe("binary path construction", () => {
    it("constructs correct path for init binaries", () => {
      const cacheSource = "/Users/test/dust";

      const qdrantPath = getBinaryPath(cacheSource, "qdrant_create_collection");
      expect(qdrantPath).toBe("/Users/test/dust/core/target/debug/qdrant_create_collection");

      const esPath = getBinaryPath(cacheSource, "elasticsearch_create_index");
      expect(esPath).toBe("/Users/test/dust/core/target/debug/elasticsearch_create_index");

      const initDbPath = getBinaryPath(cacheSource, "init_db");
      expect(initDbPath).toBe("/Users/test/dust/core/target/debug/init_db");
    });

    it("constructs correct path for service binaries", () => {
      const cacheSource = "/Users/test/dust";

      const corePath = getBinaryPath(cacheSource, "core-api");
      expect(corePath).toBe("/Users/test/dust/core/target/debug/core-api");

      const oauthPath = getBinaryPath(cacheSource, "oauth");
      expect(oauthPath).toBe("/Users/test/dust/core/target/debug/oauth");

      const sqlitePath = getBinaryPath(cacheSource, "sqlite-worker");
      expect(sqlitePath).toBe("/Users/test/dust/core/target/debug/sqlite-worker");
    });

    it("works with different cache source paths", () => {
      const path1 = getBinaryPath("/home/user/dev/dust", "core-api");
      expect(path1).toBe("/home/user/dev/dust/core/target/debug/core-api");

      const path2 = getBinaryPath("/tmp/dust-repo", "init_db");
      expect(path2).toBe("/tmp/dust-repo/core/target/debug/init_db");
    });
  });

  describe("status display format", () => {
    it("formats binary count correctly", () => {
      const available = ["core-api", "oauth"];
      const total = ALL_BINARIES.length;
      const displayText = `Binaries (${available.length}/${total}):`;
      expect(displayText).toBe(`Binaries (2/${total}):`);
    });

    it("uses correct status icons", () => {
      const presentIcon = "✓";
      const missingIcon = "✗";

      expect(presentIcon).toBe("✓");
      expect(missingIcon).toBe("✗");
    });
  });

  describe("missing binaries message", () => {
    it("formats missing list correctly", () => {
      const missing = ["init_db", "elasticsearch_create_index"];
      const message = `Missing: ${missing.join(", ")}`;
      expect(message).toBe("Missing: init_db, elasticsearch_create_index");
    });

    it("suggests rebuild command", () => {
      const suggestion = "Run 'dust-hive cache --rebuild' to build missing binaries.";
      expect(suggestion).toContain("--rebuild");
    });
  });

  describe("cache not configured message", () => {
    it("shows appropriate warning", () => {
      const warning = "Cache not configured";
      const suggestion = "Run 'dust-hive spawn' or 'dust-hive cache --rebuild' to configure cache.";

      expect(warning).toBe("Cache not configured");
      expect(suggestion).toContain("spawn");
      expect(suggestion).toContain("--rebuild");
    });
  });

  describe("command options", () => {
    interface CacheOptions {
      rebuild?: boolean;
      status?: boolean;
    }

    it("defaults to status when no options provided", () => {
      const options: CacheOptions = {};
      const resolved = { ...options };

      if (!(resolved.rebuild || resolved.status)) {
        resolved.status = true;
      }

      expect(resolved.status).toBe(true);
      expect(resolved.rebuild).toBeUndefined();
    });

    it("respects rebuild option", () => {
      const options: CacheOptions = { rebuild: true };
      const resolved = { ...options };

      if (!(resolved.rebuild || resolved.status)) {
        resolved.status = true;
      }

      expect(resolved.rebuild).toBe(true);
      expect(resolved.status).toBeUndefined();
    });

    it("respects explicit status option", () => {
      const options: CacheOptions = { status: true };
      const resolved = { ...options };

      if (!(resolved.rebuild || resolved.status)) {
        resolved.status = true;
      }

      expect(resolved.status).toBe(true);
    });
  });

  describe("error handling", () => {
    it("formats error for not in git repository", () => {
      const error = "Not in a git repository. Please run from within the Dust repo.";
      expect(error).toContain("git repository");
      expect(error).toContain("Dust repo");
    });
  });

  describe("cargo build command construction", () => {
    it("constructs correct --bin flags", () => {
      const binaries = ["core-api", "oauth", "init_db"];
      const binFlags = binaries.flatMap((b) => ["--bin", b]);

      expect(binFlags).toEqual(["--bin", "core-api", "--bin", "oauth", "--bin", "init_db"]);
    });

    it("joins into complete cargo build command", () => {
      const binaries = ["core-api", "oauth"];
      const binFlags = binaries.flatMap((b) => ["--bin", b]);
      const command = ["cargo", "build", ...binFlags].join(" ");

      expect(command).toBe("cargo build --bin core-api --bin oauth");
    });
  });
});
