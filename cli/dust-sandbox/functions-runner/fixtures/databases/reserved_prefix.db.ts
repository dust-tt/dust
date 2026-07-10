// Rejection fixture: table name using a drizzle-kit-ignored prefix.
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const sneaky = sqliteTable("_litestream_seq", {
  id: integer("id").primaryKey({ autoIncrement: true }),
});
