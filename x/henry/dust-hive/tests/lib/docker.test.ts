import { describe, expect, it } from "bun:test";
import {
  generateDockerComposeOverride,
  getDockerProjectName,
  getVolumeNames,
} from "../../src/lib/docker";
import { calculatePorts } from "../../src/lib/ports";

describe("docker", () => {
  describe("generateDockerComposeOverride", () => {
    it("generates correct port mappings", () => {
      const ports = calculatePorts(10000);
      const override = generateDockerComposeOverride("test-env", ports);

      expect(override.services.db.ports).toEqual(["10432:5432"]);
      expect(override.services.redis.ports).toEqual(["10379:6379"]);
      expect(override.services.qdrant_primary.ports).toEqual(["10333:6333", "10334:6334"]);
      expect(override.services.elasticsearch.ports).toEqual(["10200:9200"]);
      expect(override.services["apache-tika"].ports).toEqual(["10998:9998"]);
    });

    it("generates correct volume names", () => {
      const ports = calculatePorts(10000);
      const override = generateDockerComposeOverride("my-feature", ports);

      expect(override.services.db.volumes).toContain(
        "dust-hive-my-feature-pgsql:/var/lib/postgresql/data"
      );
      expect(override.services.qdrant_primary.volumes).toContain(
        "dust-hive-my-feature-qdrant-primary:/qdrant/storage"
      );
      expect(override.services.qdrant_secondary.volumes).toContain(
        "dust-hive-my-feature-qdrant-secondary:/qdrant/storage"
      );
      expect(override.services.elasticsearch.volumes).toContain(
        "dust-hive-my-feature-elasticsearch:/usr/share/elasticsearch/data"
      );
    });

    it("declares all volumes at top level", () => {
      const ports = calculatePorts(10000);
      const override = generateDockerComposeOverride("env-a", ports);

      expect(override.volumes).toHaveProperty("dust-hive-env-a-pgsql");
      expect(override.volumes).toHaveProperty("dust-hive-env-a-qdrant-primary");
      expect(override.volumes).toHaveProperty("dust-hive-env-a-qdrant-secondary");
      expect(override.volumes).toHaveProperty("dust-hive-env-a-elasticsearch");
    });
  });

  describe("getDockerProjectName", () => {
    it("returns correct project name", () => {
      expect(getDockerProjectName("test")).toBe("dust-hive-test");
      expect(getDockerProjectName("my-feature")).toBe("dust-hive-my-feature");
    });
  });

  describe("getVolumeNames", () => {
    it("returns all volume names", () => {
      const volumes = getVolumeNames("test");

      expect(volumes).toHaveLength(4);
      expect(volumes).toContain("dust-hive-test-pgsql");
      expect(volumes).toContain("dust-hive-test-qdrant-primary");
      expect(volumes).toContain("dust-hive-test-qdrant-secondary");
      expect(volumes).toContain("dust-hive-test-elasticsearch");
    });
  });
});
