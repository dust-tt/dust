// Apply-failure fixture: `second`'s index references a column of `first`, so the planned
// CREATE INDEX names a column `second` does not have. Validation passes (the index has a
// plain column list and a unique name) and the statement classifies as additive, but SQLite
// rejects it at apply time — exercising the transaction rollback (and first-claim cleanup)
// path.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const first = sqliteTable("first", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label"),
});

export const second = sqliteTable(
  "second",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
  },
  () => [index("second_bad_idx").on(first.label)]
);
