import { queryTracker } from "@app/lib/api/query_tracker";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import { context as otelContext, trace } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type {
  ColumnsDescription,
  Model,
  Options,
  QueryOptions,
  QueryOptionsWithModel,
  QueryOptionsWithType,
  QueryTypes,
  Transaction,
} from "sequelize";
import { Sequelize } from "sequelize";

declare module "sequelize" {
  interface Transaction {
    readonly id: string;
  }
}

const IDLE_IN_TX_THRESHOLD_MS = 250;
const MAX_TRACKED_QUERIES = 100;

interface TxState {
  beginAtMs: number;
  busyMs: number;
  route: string | undefined;
  lastQuerySql: string;
  queries: string[];
}

const txStates = new Map<string, TxState>();

function trackTx(
  transaction: Transaction | null | undefined,
  sql: string | { query: string; values: unknown[] }
): (() => void) | undefined {
  if (!transaction) {
    return undefined;
  }
  const sqlString = isString(sql) ? sql : sql.query;
  const upper = sqlString.trimStart().toUpperCase();
  const isBegin =
    upper.startsWith("BEGIN") || upper.startsWith("START TRANSACTION");
  const isCommit = upper.startsWith("COMMIT");
  const isRollback =
    upper.startsWith("ROLLBACK") && !upper.startsWith("ROLLBACK TO");

  const txId = transaction.id;

  if (isBegin) {
    const span = trace.getSpan(otelContext.active());
    let route: string | undefined;
    if (span && span.isRecording()) {
      const attrs = (span as unknown as ReadableSpan).attributes;
      if (attrs?.["next.route"]) {
        route = String(attrs["next.route"]);
      } else if (attrs?.["next.span_name"]) {
        const m = String(attrs["next.span_name"]).match(
          /executing api route \(pages\) (.+)$/
        );
        if (m) {
          route = m[1];
        }
      }
    }
    txStates.set(txId, {
      beginAtMs: performance.now(),
      busyMs: 0,
      route,
      lastQuerySql: "",
      queries: [],
    });
    return undefined;
  }

  const state = txStates.get(txId);
  if (!state) {
    return undefined;
  }
  const startMs = performance.now();

  return () => {
    if (isCommit || isRollback) {
      txStates.delete(txId);
      const totalMs = performance.now() - state.beginAtMs;
      const idleMs = Math.max(0, totalMs - state.busyMs);
      if (idleMs >= IDLE_IN_TX_THRESHOLD_MS) {
        logger.warn(
          {
            txId,
            totalMs,
            idleMs,
            busyMs: state.busyMs,
            outcome: isCommit ? "commit" : "rollback",
            route: state.route,
            lastQuerySql: state.lastQuerySql,
            queries: state.queries,
          },
          "Idle-in-transaction detected"
        );
      }
      return;
    }
    state.busyMs += performance.now() - startMs;
    state.lastQuerySql = sqlString;
    if (state.queries.length < MAX_TRACKED_QUERIES) {
      state.queries.push(sqlString);
    }
  };
}

// Why are we doing this?
// Sequelize is loosely typed and connection parameters are passed as is
// to the host, meaning a wrong parameter can result in wide database connection outage
// For this reason, new parameters must be reviewed carefully and peer-reviewed by a tenured engineer
// (ping @flvdvd)
// TODO(unknown time): Remove this once we move away from Sequelize
type StrictDialectOptions<T extends { appName?: string }> = T & {
  [K in keyof T as K extends "appName" ? never : K]?: never;
};

/**
 * Wrapper around Sequelize that adds sqlcommenter-style tags to queries.
 *
 * Context:
 * - Sequelize doesn't officially support query interception:
 *   https://github.com/sequelize/sequelize/issues/15416
 * - Google's sqlcommenter uses similar internal patching:
 *   https://github.com/google/sqlcommenter/blob/master/nodejs/sqlcommenter-nodejs/packages/sqlcommenter-sequelize/index.js
 * - The official sqlcommenter package is unmaintained and incompatible with modern OpenTelemetry
 */
export class SequelizeWithComments<
  T extends { appName?: string } = { appName?: string },
> extends Sequelize {
  constructor(
    uri: string,
    options?: Omit<Options, "dialectOptions"> & {
      dialectOptions?: StrictDialectOptions<T>;
    }
  ) {
    super(uri, options as Options);
  }

  /**
   * Overrides the query method to inject SQL comments with trace and route information
   */
  public query(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithType<QueryTypes.UPDATE>
  ): Promise<[undefined, number]>;
  public query(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithType<QueryTypes.BULKUPDATE>
  ): Promise<number>;
  public query(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithType<QueryTypes.INSERT>
  ): Promise<[number, number]>;
  public query(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithType<QueryTypes.UPSERT>
  ): Promise<number>;
  public query(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithType<QueryTypes.DELETE>
  ): Promise<void>;
  public query(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithType<QueryTypes.BULKDELETE>
  ): Promise<number>;
  public query(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithType<QueryTypes.SHOWTABLES>
  ): Promise<string[]>;
  public query(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithType<QueryTypes.DESCRIBE>
  ): Promise<ColumnsDescription>;
  public query<M extends Model>(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithModel<M> & { plain: true }
  ): Promise<M | null>;
  public query<M extends Model>(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithModel<M>
  ): Promise<M[]>;
  public query<T extends object>(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithType<QueryTypes.SELECT> & { plain: true }
  ): Promise<T | null>;
  public query<T extends object>(
    sql: string | { query: string; values: unknown[] },
    options: QueryOptionsWithType<QueryTypes.SELECT>
  ): Promise<T[]>;
  public query(
    sql: string | { query: string; values: unknown[] },
    options: (QueryOptions | QueryOptionsWithType<QueryTypes.RAW>) & {
      plain: true;
    }
  ): Promise<{ [key: string]: unknown } | null>;
  public query(
    sql: string | { query: string; values: unknown[] },
    options?: QueryOptions | QueryOptionsWithType<QueryTypes.RAW>
  ): Promise<[unknown[], unknown]>;

  override async query(
    sql: string | { query: string; values: unknown[] },
    options?: QueryOptions | QueryOptionsWithType<any>
  ): Promise<any> {
    const ctx = queryTracker.getStore();
    if (ctx) {
      ctx.concurrent++;
      ctx.peak = Math.max(ctx.peak, ctx.concurrent);
    }

    const onQueryEnd = trackTx(options?.transaction, sql);

    try {
      // Only process string queries.
      if (typeof sql !== "string") {
        return await super.query(sql, options);
      }

      // Skip if already has comments (avoid double-commenting).
      if (sql.includes("/*")) {
        return await super.query(sql, options);
      }

      const comments: Record<string, string> = {};

      // Get Next.js route from OpenTelemetry span.
      const span = trace.getSpan(otelContext.active());
      if (span && span.isRecording()) {
        const readableSpan = span as unknown as ReadableSpan;
        const attrs = readableSpan.attributes;

        // Case 1: getServerSideProps/getStaticProps: has explicit `next.route`.
        if (attrs?.["next.route"]) {
          comments.route = attrs["next.route"] as string;
        }
        // Case 2: API routes: extract from next.span_name.
        else if (attrs?.["next.span_name"]) {
          const spanName = attrs["next.span_name"] as string;
          // Extract route from: "executing api route (pages) /api/w/[wId]/feature-flags".
          const match = spanName.match(/executing api route \(pages\) (.+)$/);
          if (match) {
            comments.route = match[1];
          }
        }
      }

      // Build comment string following sqlcommenter format
      // https://google.github.io/sqlcommenter/spec/
      const keys = Object.keys(comments)
        .filter((key) => comments[key])
        .sort();

      if (keys.length > 0) {
        const commentStr = keys
          .map(
            (key) =>
              `${encodeURIComponent(key)}='${encodeURIComponent(comments[key])}'`
          )
          .join(",");
        sql = `${sql} /*${commentStr}*/`;
      }

      return await super.query(sql, options);
    } finally {
      if (ctx) {
        ctx.concurrent--;
      }
      onQueryEnd?.();
    }
  }
}
