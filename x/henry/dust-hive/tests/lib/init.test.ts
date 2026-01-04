import { describe, expect, it } from "bun:test";
import { DB_INIT_CONFIGS, getTemporalNamespaces } from "../../src/lib/init";

describe("init", () => {
  describe("getTemporalNamespaces", () => {
    it("generates 4 namespaces for an environment", () => {
      const namespaces = getTemporalNamespaces("test");
      expect(namespaces).toHaveLength(4);
    });

    it("generates correct namespace names", () => {
      const namespaces = getTemporalNamespaces("my-feature");
      expect(namespaces).toEqual([
        "dust-hive-my-feature",
        "dust-hive-my-feature-agent",
        "dust-hive-my-feature-connectors",
        "dust-hive-my-feature-relocation",
      ]);
    });

    it("handles simple environment names", () => {
      const namespaces = getTemporalNamespaces("test");
      expect(namespaces[0]).toBe("dust-hive-test");
      expect(namespaces[1]).toBe("dust-hive-test-agent");
      expect(namespaces[2]).toBe("dust-hive-test-connectors");
      expect(namespaces[3]).toBe("dust-hive-test-relocation");
    });

    it("handles environment names with hyphens", () => {
      const namespaces = getTemporalNamespaces("auth-feature-v2");
      expect(namespaces[0]).toBe("dust-hive-auth-feature-v2");
      expect(namespaces[1]).toBe("dust-hive-auth-feature-v2-agent");
    });

    it("handles single character environment names", () => {
      const namespaces = getTemporalNamespaces("a");
      expect(namespaces[0]).toBe("dust-hive-a");
      expect(namespaces[1]).toBe("dust-hive-a-agent");
    });
  });

  describe("DB_INIT_CONFIGS", () => {
    it("contains 4 initialization steps", () => {
      expect(DB_INIT_CONFIGS).toHaveLength(4);
    });

    it("has init_dev_container as first step", () => {
      const first = DB_INIT_CONFIGS[0];
      expect(first).toBeDefined();
      expect(first?.name).toBe("init_dev_container");
      expect(first?.dir).toBe(".");
      expect(first?.needsNvm).toBe(true);
    });

    it("has core database as second step", () => {
      const second = DB_INIT_CONFIGS[1];
      expect(second).toBeDefined();
      expect(second?.name).toBe("core database");
      expect(second?.dir).toBe("core");
      expect(second?.needsNvm).toBe(false);
    });

    it("has front database as third step", () => {
      const third = DB_INIT_CONFIGS[2];
      expect(third).toBeDefined();
      expect(third?.name).toBe("front database");
      expect(third?.dir).toBe("front");
      expect(third?.needsNvm).toBe(true);
      expect(third?.commands).toContain("./admin/init_db.sh --unsafe");
    });

    it("has connectors database as fourth step", () => {
      const fourth = DB_INIT_CONFIGS[3];
      expect(fourth).toBeDefined();
      expect(fourth?.name).toBe("connectors database");
      expect(fourth?.dir).toBe("connectors");
      expect(fourth?.needsNvm).toBe(true);
    });

    it("all configs have required fields", () => {
      for (const config of DB_INIT_CONFIGS) {
        expect(config.name).toBeDefined();
        expect(typeof config.name).toBe("string");
        expect(config.dir).toBeDefined();
        expect(typeof config.dir).toBe("string");
        expect(config.commands).toBeDefined();
        expect(Array.isArray(config.commands)).toBe(true);
        expect(config.commands.length).toBeGreaterThan(0);
      }
    });
  });
});
