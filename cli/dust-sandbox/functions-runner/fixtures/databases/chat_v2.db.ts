// Additive evolution of chat.db.ts: one new column, one new index, one new table.
import {
  blob,
  index,
  integer,
  primaryKey,
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
    displayName: text("display_name"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(
      () => new Date()
    ),
    attachments: text("attachments", { mode: "json" }).$type<string[]>(),
    active: integer("active", { mode: "boolean" }).default(true),
    nickname: text("nickname").default("anon"),
    score: real("score"),
    counter: blob("counter", { mode: "bigint" }),
    bio: text("bio"),
  },
  (t) => [
    uniqueIndex("users_handle_idx").on(t.handle),
    index("users_created_idx").on(t.createdAt, t.handle),
    index("users_bio_idx").on(t.bio),
  ]
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    body: text("body").notNull(),
    authorId: integer("author_id"),
    slug: text("slug"),
  },
  (t) => [uniqueIndex("messages_slug_idx").on(t.slug)]
);

export const settings = sqliteTable(
  "settings",
  {
    key: text("key"),
    scope: text("scope").notNull(),
    value: text("value"),
  },
  (t) => [
    primaryKey({ columns: [t.key] }),
    uniqueIndex("settings_scope_value_idx").on(t.scope, t.value),
  ]
);

export const reactions = sqliteTable("reactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: integer("message_id").notNull(),
  emoji: text("emoji").notNull(),
});
