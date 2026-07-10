// Rejection fixture: column named after an Object.prototype key. Table/column/index names
// become plain-object keys in the runner's extracted state, where
// __proto__/constructor/prototype are prototype-pollution vectors.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const evil = sqliteTable("evil", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proto: text("__proto__"),
});
