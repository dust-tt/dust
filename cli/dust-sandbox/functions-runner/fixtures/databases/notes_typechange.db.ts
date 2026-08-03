// Type-change fixture for reconcile tests: `label` flips text -> integer relative to
// notes.db.ts, which forces a table recreate-and-copy plan that must be refused.
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: integer("label"),
});
