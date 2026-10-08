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
      expect(override.services.qdrant.ports).toEqual(["10333:6333", "10334:6334"]);
      expect(override.services.elasticsearch.ports).toEqual(["10200:9200"]);
      expect(override.services.kibana.ports).toEqual(["10601:5601"]);
      expect(override.services["apache-tika"].ports).toEqual(["10998:9998"]);
    });

    it("publishes fdb on the same port number it listens on", () => {
      const override = generateDockerComposeOverride("test-env", calculatePorts(10000));

      expect(override.services.fdb.ports).toEqual(["10500:10500"]);
      expect(override.services.fdb.environment.FDB_PORT).toBe("10500");
      expect(override.services.fdb_init.environment.FDB_PORT).toBe("10500");
    });

    it("gives each environment its own fdb port", () => {
      const envA = generateDockerComposeOverride("env-a", calculatePorts(10000));
      const envB = generateDockerComposeOverride("env-b", calculatePorts(11000));

      expect(envA.services.fdb.ports).toEqual(["10500:10500"]);
      expect(envB.services.fdb.ports).toEqual(["11500:11500"]);
    });

    it("generates correct volume names", () => {
      const ports = calculatePorts(10000);
      const override = generateDockerComposeOverride("my-feature", ports);

      expect(override.services.db.volumes).toContain(
        "dust-hive-my-feature-pgsql:/var/lib/postgresql/data"
      );
      expect(override.services.qdrant.volumes).toContain(
        "dust-hive-my-feature-qdrant:/qdrant/storage"
      );
      expect(override.services.elasticsearch.volumes).toContain(
        "dust-hive-my-feature-elasticsearch:/usr/share/elasticsearch/data"
      );
      expect(override.services.fdb.volumes).toEqual(["dust-hive-my-feature-fdb:/var/fdb/data"]);
    });

    it("declares all volumes at top level", () => {
      const ports = calculatePorts(10000);
      const override = generateDockerComposeOverride("env-a", ports);

      expect(override.volumes).toHaveProperty("dust-hive-env-a-pgsql");
      expect(override.volumes).toHaveProperty("dust-hive-env-a-qdrant");
      expect(override.volumes).toHaveProperty("dust-hive-env-a-elasticsearch");
      expect(override.volumes).toHaveProperty("dust-hive-env-a-fdb");
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
      expect(volumes).toContain("dust-hive-test-qdrant");
      expect(volumes).toContain("dust-hive-test-elasticsearch");
      expect(volumes).toContain("dust-hive-test-fdb");
    });
  });
});
