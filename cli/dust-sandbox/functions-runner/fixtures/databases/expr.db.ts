// Rejection fixture: index over an SQL expression. The manifest records an index as a plain
// column list, so an expression index could be neither diffed nor recreated from it.
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    label: text("label"),
  },
  (t) => [index("tags_label_lower_idx").on(sql`lower(${t.label})`)]
);
