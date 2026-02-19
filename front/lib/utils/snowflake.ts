/**
 * Escape a Snowflake identifier for use in double-quoted SQL.
 * Doubles any internal double-quote characters to prevent SQL injection.
 */
export function escapeSnowflakeIdentifier(identifier: string): string {
  return identifier.replace(/"/g, '""');
}
