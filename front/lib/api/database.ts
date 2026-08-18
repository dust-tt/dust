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
    readonly parent?: Transaction;
  }
}

const IDLE_IN_TX_THRESHOLD_MS = 250;
const MAX_TRACKED_QUERIES = 100;
const LAG_SAMPLE_INTERVAL_MS = 50;

// Event-loop lag accumulated process-wide. A stop-the-world pause (major GC, a blocking
// callback) suspends every transaction that is open at that moment, and Postgres reports all of
// them as idle in transaction. Without measuring the pause, one process freeze reads as a
// separate slow codepath on each of those transactions.
let cumulativeLagMs = 0;
let lastLagSampleAtMs = performance.now();

setInterval(() => {
  const nowMs = performance.now();
  cumulativeLagMs += Math.max(
    0,
    nowMs - lastLagSampleAtMs - LAG_SAMPLE_INTERVAL_MS
  );
  lastLagSampleAtMs = nowMs;
}, LAG_SAMPLE_INTERVAL_MS).unref();

interface TxState {
  beginAtMs: number;
  busyMs: number;
  busyStartMs: number;
  idleLagMs: number;
  idleStartMs: number;
  inFlightCount: number;
  lagAtIdleStartMs: number;
  lastQuerySql: string;
  maxGapAfterSql: string;
  maxGapLagMs: number;
  maxGapMs: number;
  queries: string[];
}

// Keyed on the transaction object, so statements can only ever be attributed to the transaction
// they were issued with, and an abandoned transaction is collected instead of leaking its state.
const txStates = new WeakMap<Transaction, TxState>();

// Savepoints are distinct Transaction objects nested in the one that owns the BEGIN/COMMIT pair.
function rootTransaction(transaction: Transaction): Transaction {
  let root = transaction;
  while (root.parent) {
    root = root.parent;
  }
  return root;
}

// A transaction runs its statements one at a time, but callers can issue several before the
// earlier ones complete, and those then queue on the connection. Timing each statement from the
// moment it is issued makes those windows overlap, so busy time is their union.
// Lag while a statement is in flight is already part of busyMs, so only the lag observed between
// two statements is kept: that is the part that inflates the idle window.
// The widest single gap and the statement that preceded it are kept as well, so a slow transaction
// points at one phase of the code path instead of only reporting how much idle time it accumulated.
function openBusyWindow(state: TxState, atMs: number): void {
  if (state.inFlightCount === 0) {
    state.busyStartMs = atMs;
    const gapLagMs = cumulativeLagMs - state.lagAtIdleStartMs;
    const gapMs = atMs - state.idleStartMs;
    state.idleLagMs += gapLagMs;
    if (gapMs > state.maxGapMs) {
      state.maxGapMs = gapMs;
      state.maxGapLagMs = gapLagMs;
      state.maxGapAfterSql = state.lastQuerySql;
    }
  }
  state.inFlightCount += 1;
}

function closeBusyWindow(state: TxState, atMs: number): void {
  state.inFlightCount -= 1;
  if (state.inFlightCount === 0) {
    state.busyMs += atMs - state.busyStartMs;
    state.idleStartMs = atMs;
    state.lagAtIdleStartMs = cumulativeLagMs;
  }
}

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

  const root = rootTransaction(transaction);

  if (isBegin) {
    const beginAtMs = performance.now();
    // BEGIN is a round trip like any other statement: the backend runs it, it is not idle.
    const state: TxState = {
      beginAtMs,
      busyMs: 0,
      busyStartMs: beginAtMs,
      idleLagMs: 0,
      idleStartMs: beginAtMs,
      inFlightCount: 1,
      lagAtIdleStartMs: cumulativeLagMs,
      lastQuerySql: sqlString,
      maxGapAfterSql: "",
      maxGapLagMs: 0,
      maxGapMs: 0,
      queries: [],
    };
    txStates.set(root, state);

    return () => {
      closeBusyWindow(state, performance.now());
    };
  }

  const state = txStates.get(root);
  if (!state) {
    return undefined;
  }
  openBusyWindow(state, performance.now());

  return () => {
    const endMs = performance.now();
    closeBusyWindow(state, endMs);

    if (isCommit || isRollback) {
      txStates.delete(root);
      const totalMs = endMs - state.beginAtMs;
      const idleMs = Math.max(0, totalMs - state.busyMs);
      const lagMs = Math.min(idleMs, state.idleLagMs);
      if (idleMs - lagMs >= IDLE_IN_TX_THRESHOLD_MS) {
        logger.warn(
          {
            txId: root.id,
            totalMs: Math.round(totalMs),
            idleMs: Math.round(idleMs),
            busyMs: Math.round(state.busyMs),
            lagMs: Math.round(lagMs),
            maxGapMs: Math.round(state.maxGapMs),
            maxGapLagMs: Math.round(state.maxGapLagMs),
            maxGapAfterSql: state.maxGapAfterSql,
            outcome: isCommit ? "commit" : "rollback",
            lastQuerySql: state.lastQuerySql,
            queries: state.queries,
          },
          "Idle-in-transaction detected"
        );
      }
      return;
    }

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
