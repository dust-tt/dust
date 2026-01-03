import YAML from "yaml";
import { getDockerOverridePath } from "./paths";
import type { PortAllocation } from "./ports";

export interface DockerComposeOverride {
  services: {
    db: {
      ports: string[];
      volumes: string[];
    };
    redis: {
      ports: string[];
    };
    qdrant_primary: {
      ports: string[];
      volumes: string[];
    };
    qdrant_secondary: {
      volumes: string[];
    };
    elasticsearch: {
      ports: string[];
      volumes: string[];
    };
    "apache-tika": {
      ports: string[];
    };
  };
  volumes: Record<string, null>;
}

// Generate docker-compose.override.yml content for an environment
export function generateDockerComposeOverride(
  name: string,
  ports: PortAllocation
): DockerComposeOverride {
  return {
    services: {
      db: {
        ports: [`${ports.postgres}:5432`],
        volumes: [`dust-hive-${name}-pgsql:/var/lib/postgresql/data`],
      },
      redis: {
        ports: [`${ports.redis}:6379`],
      },
      qdrant_primary: {
        ports: [`${ports.qdrantHttp}:6334`, `${ports.qdrantGrpc}:6333`],
        volumes: [`dust-hive-${name}-qdrant-primary:/qdrant/storage`],
      },
      qdrant_secondary: {
        volumes: [`dust-hive-${name}-qdrant-secondary:/qdrant/storage`],
      },
      elasticsearch: {
        ports: [`${ports.elasticsearch}:9200`],
        volumes: [`dust-hive-${name}-elasticsearch:/usr/share/elasticsearch/data`],
      },
      "apache-tika": {
        ports: [`${ports.apacheTika}:9998`],
      },
    },
    volumes: {
      [`dust-hive-${name}-pgsql`]: null,
      [`dust-hive-${name}-qdrant-primary`]: null,
      [`dust-hive-${name}-qdrant-secondary`]: null,
      [`dust-hive-${name}-elasticsearch`]: null,
    },
  };
}

// Write docker-compose.override.yml file for an environment
export async function writeDockerComposeOverride(
  name: string,
  ports: PortAllocation
): Promise<void> {
  const override = generateDockerComposeOverride(name, ports);
  const content = YAML.stringify(override);
  const path = getDockerOverridePath(name);
  await Bun.write(path, content);
}

// Get docker project name for an environment
export function getDockerProjectName(name: string): string {
  return `dust-hive-${name}`;
}

// Get list of volume names for an environment
export function getVolumeNames(name: string): string[] {
  return [
    `dust-hive-${name}-pgsql`,
    `dust-hive-${name}-qdrant-primary`,
    `dust-hive-${name}-qdrant-secondary`,
    `dust-hive-${name}-elasticsearch`,
  ];
}
