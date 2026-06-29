import { describe, expect, it } from "bun:test";
import { getTemporalNamespaces } from "../../src/lib/init";

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
});
