// Destructive evolution of chat.db.ts: drops the display_name column and the messages and
// settings tables. Reconcile must refuse it.
import {
  blob,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    handle: text("handle").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(
      () => new Date()
    ),
    attachments: text("attachments", { mode: "json" }).$type<string[]>(),
    active: integer("active", { mode: "boolean" }).default(true),
    score: real("score"),
    counter: blob("counter", { mode: "bigint" }),
  },
  (t) => [
    uniqueIndex("users_handle_idx").on(t.handle),
    index("users_created_idx").on(t.createdAt, t.handle),
  ]
);
