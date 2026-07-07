// Rejection fixture: column-level .unique() — a UNIQUE constraint in the table DDL, which
// SQLite can only add/drop through a table rebuild (uniqueIndex() is the supported form).
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  handle: text("handle").unique(),
});
