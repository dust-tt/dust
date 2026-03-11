import logger from "@app/logger/logger";
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
} from "sequelize";
import { DatabaseError, Sequelize } from "sequelize";

const NEXT_PAGES_ROUTE_REGEX = /executing api route \(pages\) (.+)$/;

// PostgreSQL error code 57014 = query_canceled, which is what statement_timeout triggers.
function isStatementTimeoutError(err: unknown): boolean {
  return (
    err instanceof DatabaseError &&
    (err.original as { code?: string })?.code === "57014"
  );
}

/**
 * Extract the current Next.js route from the active OpenTelemetry span.
 * Next.js sets `next.route` on SSR spans and encodes the route in `next.span_name` for API routes.
 */
function extractRouteFromOtelSpan(): string | null {
  const span = trace.getSpan(otelContext.active());
  if (!span || !span.isRecording()) {
    return null;
  }

  // The OTel API Span type doesn't expose .attributes; cast to SDK's ReadableSpan.
  const readableSpan = span as unknown as ReadableSpan;
  const attrs = readableSpan.attributes;

  if (attrs?.["next.route"]) {
    return attrs["next.route"] as string;
  }

  if (attrs?.["next.span_name"]) {
    const spanName = attrs["next.span_name"] as string;
    const match = spanName.match(NEXT_PAGES_ROUTE_REGEX);
    if (match) {
      return match[1];
    }
  }

  return null;
}

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
export class SequelizeWithComments extends Sequelize {
  constructor(uri: string, options?: Options) {
    super(uri, options);
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
    // Only process string queries.
    if (typeof sql !== "string") {
      return this.queryWithTimeoutLogging(sql, options);
    }

    // Skip if already has comments (avoid double-commenting).
    if (sql.includes("/*")) {
      return this.queryWithTimeoutLogging(sql, options);
    }

    const comments: Record<string, string> = {};

    const route = extractRouteFromOtelSpan();
    if (route) {
      comments.route = route;
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

    return this.queryWithTimeoutLogging(sql, options);
  }

  private async queryWithTimeoutLogging(
    sql: string | { query: string; values: unknown[] },
    options?: QueryOptions | QueryOptionsWithType<any>
  ): Promise<any> {
    try {
      return await super.query(sql, options);
    } catch (err) {
      if (isStatementTimeoutError(err)) {
        const sqlText = typeof sql === "string" ? sql : sql.query;

        logger.error(
          {
            err,
            sql: sqlText.slice(0, 4096),
            route: extractRouteFromOtelSpan() ?? "unknown",
            model: (options as any)?.model?.name,
            queryType: options?.type,
          },
          "Sequelize query timed out (statement_timeout)"
        );
      }
      throw err;
    }
  }
}
