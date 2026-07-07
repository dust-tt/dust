// Rejection fixture: CHECK constraint.
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const scores = sqliteTable(
  "scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    value: integer("value"),
  },
  (t) => [check("value_positive", sql`${t.value} > 0`)]
);
