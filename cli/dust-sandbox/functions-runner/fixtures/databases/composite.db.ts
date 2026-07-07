// Rejection fixture: composite primary key.
import { integer, primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";

export const pairs = sqliteTable(
  "pairs",
  {
    left: integer("left"),
    right: integer("right"),
  },
  (t) => [primaryKey({ columns: [t.left, t.right] })]
);
