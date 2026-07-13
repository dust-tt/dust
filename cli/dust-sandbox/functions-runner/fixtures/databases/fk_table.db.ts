// Rejection fixture: table-level foreignKey().
import { foreignKey, integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const parents = sqliteTable("parents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
});

export const children = sqliteTable(
  "children",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    parentId: integer("parent_id"),
  },
  (t) => [foreignKey({ columns: [t.parentId], foreignColumns: [parents.id] })]
);
