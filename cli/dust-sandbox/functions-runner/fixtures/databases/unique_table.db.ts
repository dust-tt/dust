// Rejection fixture: table-level unique() constraint (same table-DDL problem as .unique()).
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scope: text("scope"),
    handle: text("handle"),
  },
  (t) => [unique("users_scope_handle_unique").on(t.scope, t.handle)]
);
