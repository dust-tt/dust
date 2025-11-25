import { context as otelContext, trace } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { Options, QueryOptions, QueryOptionsWithType } from "sequelize";
import { Sequelize } from "sequelize";

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
  override async query(
    sql: string | { query: string; values: unknown[] },
    options?: QueryOptions | QueryOptionsWithType<any>
  ): Promise<any> {
    // Only process string queries.
    if (typeof sql !== "string") {
      return super.query(sql, options);
    }

    // Skip if already has comments (avoid double-commenting).
    if (sql.includes("/*")) {
      return super.query(sql, options);
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
      console.log(">> sql:" + sql);
    }

    return super.query(sql, options);
  }
}
