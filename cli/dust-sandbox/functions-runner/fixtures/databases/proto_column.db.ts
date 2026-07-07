// Rejection fixture: column named after an Object.prototype key.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const evil = sqliteTable("evil", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proto: text("__proto__"),
});
