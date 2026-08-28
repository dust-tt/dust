import { SequelizeWithComments } from "@app/lib/api/database";
import { dbConfig } from "@app/lib/resources/storage/config";
import { statsDMetrics } from "@app/lib/utils/statsd";
import { isDevelopment } from "@app/types/shared/env";
import assert from "assert";
import type { Sequelize } from "sequelize";

// Directly require 'pg' here to make sure we are using the same version of the
// package as the one used by pg package.
// The doc recommends doing this : https://github.com/brianc/node-pg-types?tab=readme-ov-file#use
// eslint-disable-next-line @typescript-eslint/no-require-imports
const types = require("pg").types;

const acquireAttempts = new WeakMap<object, number>();

const { DB_LOGGING_ENABLED = false } = process.env;

function sequelizeLogger(message: string) {
  console.log(message.replace("Executing (default): ", ""));
}

// Parse PostgreSQL BIGINT (INT8) values into JavaScript numbers, but only if they
// fall within JavaScript's safe integer range (-(2^53 - 1) to 2^53 - 1). This
// prevents silent precision loss when handling large integers from the database.
// Throws an assertion error if a BIGINT value exceeds JavaScript's safe integer
// limits.
function parseBigIntToSafeNumber(val: string): number {
  assert(
    Number.isSafeInteger(Number(val)),
    `Found a value stored as a BIGINT that is not a safe integer: ${val}`
  );
  return Number(val);
}

// Reference: https://github.com/postgres/postgres/blob/master/src/include/catalog/pg_type.dat#L55
const INT8_OID = 20;
const INT8_ARRAY_OID = 1016;

// Override parser for single BIGINT values.
types.setTypeParser(INT8_OID, parseBigIntToSafeNumber);

// Override parser for BIGINT arrays.
// By default, pg-types returns arrays of strings for BIGINT[].
// We get the default array parser, then map each element through our safe
// number parser to ensure all values are validated and converted to JavaScript numbers.
const parseBigIntegerArray = types.getTypeParser(INT8_ARRAY_OID);
types.setTypeParser(INT8_ARRAY_OID, (val: string) =>
  parseBigIntegerArray(val).map(parseBigIntToSafeNumber)
);

// Sequelize-pool exposes these getters at runtime but Sequelize's type
// definitions do not surface them on `connectionManager.pool`.
declare module "sequelize/types/dialects/abstract/connection-manager" {
  interface ConnectionManager {
    pool: {
      available: number;
      size: number;
      using: number;
      waiting: number;
    };
  }
}

function reportPoolMetrics(
  sequelize: SequelizeWithComments,
  tags: string[]
): void {
  const { pool } = sequelize.connectionManager;
  if (!pool) {
    return;
  }

  statsDMetrics.gauge("sequelize.pool.size", pool.size, tags);
  statsDMetrics.gauge("sequelize.pool.available", pool.available, tags);
  statsDMetrics.gauge("sequelize.pool.using", pool.using, tags);
  statsDMetrics.gauge("sequelize.pool.waiting", pool.waiting, tags);
}

const POOL_TAGS = ["pool:front_master"];

// DO NOT BLINDLY INCREASE THIS NUMBER. Each connection holds a PostgreSQL
// backend via PgBouncer, so raising it shifts contention downstream. Prefer
// reducing per-request connection usage (caching, shared connections).
const POOL_MAX = 10;

export const frontSequelize = new SequelizeWithComments(
  dbConfig.getRequiredFrontDatabaseURI(),
  {
    pool: {
      max: POOL_MAX,
      acquire: 30000,
    },
    logging: isDevelopment() && DB_LOGGING_ENABLED ? sequelizeLogger : false,
    hooks: {
      beforePoolAcquire: (options) => {
        acquireAttempts.set(options, Date.now());
      },
      afterPoolAcquire: (_connection, options) => {
        const startMs = acquireAttempts.get(options);
        if (startMs === undefined) {
          return;
        }

        statsDMetrics.distribution(
          "sequelize.connection_acquisition.duration",
          Date.now() - startMs,
          POOL_TAGS
        );

        reportPoolMetrics(frontSequelize, POOL_TAGS);
      },
    },
    dialectOptions: {
      appName: "front master",
    },
  }
);

let frontReplicaDbInstance: Sequelize | null = null;

export function getFrontReplicaDbConnection() {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!frontReplicaDbInstance) {
    frontReplicaDbInstance = new SequelizeWithComments(
      dbConfig.getRequiredFrontReplicaDatabaseURI() as string,
      {
        logging: false,
        dialectOptions: {
          appName: "front replica",
        },
      }
    );
  }

  return frontReplicaDbInstance;
}
