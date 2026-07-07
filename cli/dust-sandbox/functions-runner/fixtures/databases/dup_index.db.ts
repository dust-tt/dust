// Apply-failure fixture: two tables declare the same index name. Per-table manifest validation
// passes and both CREATE INDEX statements classify as additive, but SQLite rejects the second
// at apply time — exercising the transaction rollback (and first-claim cleanup) path.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const alpha = sqliteTable(
  "alpha",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    label: text("label"),
  },
  (t) => [index("dup_idx").on(t.label)]
);

export const beta = sqliteTable(
  "beta",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    label: text("label"),
  },
  (t) => [index("dup_idx").on(t.label)]
);
