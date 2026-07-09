// Rejection fixture: two primary-key declarations on one table (column-level .primaryKey()
// plus table-level primaryKey()). SQLite allows a single PRIMARY KEY per table.
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const twice = sqliteTable(
  "twice",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug"),
  },
  (t) => [primaryKey({ columns: [t.slug] })]
);
