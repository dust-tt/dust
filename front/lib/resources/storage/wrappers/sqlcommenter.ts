import type { Sequelize } from "sequelize";

const hasComment = (sql: string | null) => {
  if (!sql) {
    return false;
  }

  // See https://docs.oracle.com/cd/B12037_01/server.101/b10759/sql_elements006.htm
  // for how to detect comments.
  const indexOpeningDashDashComment = sql.indexOf("--");
  if (indexOpeningDashDashComment >= 0) {
    return true;
  }

  const indexOpeningSlashComment = sql.indexOf("/*");
  if (indexOpeningSlashComment < 0) {
    return false;
  }

  // Check if it is a well formed comment.
  const indexClosingSlashComment = sql.indexOf("*/");

  /* c8 ignore next */
  return indexOpeningSlashComment < indexClosingSlashComment;
};

const makeMinimalUsefulStacktrace = (): string | null => {
  const stacktrace = new Error().stack;

  if (!stacktrace) {
    return null;
  }

  // Most Sequelize queries contain something of the form "at Function.{query}",
  // e.g. "at Function.findAll". This is a hint to help us find useful
  // context.
  const indexOfUsefulInfoForQuery = stacktrace.lastIndexOf("node_modules/");
  let minimalUsefulStacktrace = stacktrace.slice(
    indexOfUsefulInfoForQuery >= 0
      ? indexOfUsefulInfoForQuery
      : stacktrace.indexOf("at")
  );

  // Only get about 4 lines of context
  minimalUsefulStacktrace = minimalUsefulStacktrace
    .split("\n")
    .slice(1, 5)
    .map((stackLine) => stackLine.trim())
    .join("\n");

  return minimalUsefulStacktrace;
};

export function wrapSequelize(
  sequelize: Sequelize & {
    ___alreadySQLCommenterWrapped___?: boolean;
  }
) {
  /* c8 ignore next 2 */
  if (sequelize.___alreadySQLCommenterWrapped___) {
    return;
  }

  // @ts-expect-error - access to a private property of sequelize
  const originalRunFunction = sequelize.dialect.Query.prototype.run;
  // Please don't change this prototype from an explicit function
  // to use arrow functions lest we'll get bugs with not resolving "this".
  // @ts-expect-error - access to a private property of sequelize
  sequelize.dialect.Query.prototype.run = function (
    sql: string | null,
    sql_options: any
  ) {
    // If a comment already exists, do not insert a new one.
    if (hasComment(sql)) {
      // Just proceed with the next function ASAP
      return originalRunFunction.apply(this, [sql, sql_options]);
    }

    // Allow only alphanumeric, periods, slashes, dashes, underscores,
    // spaces, newlines. The main concern is preventing injection of '*/
    // within the stacktrace.
    //
    // We also don't include any quotes with the stacktrace because
    const stacktrace = makeMinimalUsefulStacktrace();
    if (!stacktrace) {
      return originalRunFunction.apply(this, [sql, sql_options]);
    }

    const commentStr = `stacktrace=\n${stacktrace.replace(/[^\w.:/\\\-\s\n]/g, "")}`;

    if (commentStr && commentStr.length > 0) {
      sql = `${sql} /* ${commentStr} */`;
    }

    return originalRunFunction.apply(this, [sql, sql_options]);
  };

  // Mark the object as having already been wrapped.
  sequelize.___alreadySQLCommenterWrapped___ = true;
}
