import {
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// /!\ The schema files SHOULD NOT contain any runtime logic besides defining your DB schema.

export const connectors = pgTable(
  "connectors",
  {
    id: serial("id").primaryKey(),

    createdAt: timestamp("createdAt", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    type: varchar("type", {
      enum: [
        "confluence",
        "github",
        "google_drive",
        "intercom",
        "notion",
        "slack",
        "webcrawler",
      ],
      length: 256,
    }).notNull(),

    connectionId: varchar("connectionId", { length: 256 }).notNull(),

    workspaceAPIKey: varchar("workspaceAPIKey", { length: 256 }).notNull(),
    workspaceId: varchar("workspaceId", { length: 256 }).notNull(),
    dataSourceName: varchar("dataSourceName", { length: 256 }).notNull(),

    lastSyncStatus: varchar("lastSyncStatus", {
      enum: ["succeeded", "failed"],
      length: 256,
    }),

    errorType: varchar("errorType", { length: 256 }),
    lastSyncStartTime: timestamp("lastSyncStartTime", {
      mode: "date",
      withTimezone: true,
    }),
    lastSyncFinishTime: timestamp("lastSyncFinishTime", {
      mode: "date",
      withTimezone: true,
    }),
    lastSyncSuccessfulTime: timestamp("lastSyncSuccessfulTime", {
      mode: "date",
      withTimezone: true,
    }),
    firstSuccessfulSyncTime: timestamp("firstSuccessfulSyncTime", {
      mode: "date",
      withTimezone: true,
    }),
    firstSyncProgress: varchar("firstSyncProgress"),
    lastGCTime: varchar("lastGCTime"),
  },
  (table) => {
    return {
      nameIdx: uniqueIndex("connectors_workspace_id_data_source_name").on(
        table.workspaceId,
        table.dataSourceName
      ),
    };
  }
);

export type Connector = typeof connectors.$inferSelect; // return type when queried
export type NewConnector = typeof connectors.$inferInsert; // insert type
