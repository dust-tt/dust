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
    id: serial("id").primaryKey().notNull(),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    updatedAt: timestamp("updatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    type: varchar("type", { length: 255 }).notNull(),
    connectionId: varchar("connectionId", { length: 255 }).notNull(),
    workspaceApiKey: varchar("workspaceAPIKey", { length: 255 }).notNull(),
    workspaceId: varchar("workspaceId", { length: 255 }).notNull(),
    dataSourceName: varchar("dataSourceName", { length: 255 }).notNull(),
    lastSyncStatus: varchar("lastSyncStatus", { length: 255 }),
    errorType: varchar("errorType", { length: 255 }),
    lastSyncStartTime: timestamp("lastSyncStartTime", {
      withTimezone: true,
      mode: "string",
    }),
    lastSyncFinishTime: timestamp("lastSyncFinishTime", {
      withTimezone: true,
      mode: "string",
    }),
    lastSyncSuccessfulTime: timestamp("lastSyncSuccessfulTime", {
      withTimezone: true,
      mode: "string",
    }),
    firstSuccessfulSyncTime: timestamp("firstSuccessfulSyncTime", {
      withTimezone: true,
      mode: "string",
    }),
    firstSyncProgress: varchar("firstSyncProgress", { length: 255 }),
    lastGcTime: timestamp("lastGCTime", { withTimezone: true, mode: "string" }),
  },
  (table) => {
    return {
      workspaceIdDataSourceName: uniqueIndex(
        "connectors_workspace_id_data_source_name"
      ).on(table.workspaceId, table.dataSourceName),
    };
  }
);

export type Connector = typeof connectors.$inferSelect; // Return type when queried.
export type NewConnector = typeof connectors.$inferInsert; // Insert type.
