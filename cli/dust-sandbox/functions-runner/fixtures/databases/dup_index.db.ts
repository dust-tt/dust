// Apply-failure fixture: two tables declare the same index name. Table and index names share
// one database-global namespace in SQLite, so the second CREATE INDEX fails at apply and the
// transaction rolls back.
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
