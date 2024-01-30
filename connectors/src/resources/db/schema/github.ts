import {
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { connectors } from "googleapis/build/src/apis/connectors";

// /!\ The schema files SHOULD NOT contain any runtime logic besides defining your DB schema.

export const githubCodeRepositories = pgTable(
  "github_code_repositories",
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
    lastSeenAt: timestamp("lastSeenAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    repoId: varchar("repoId", { length: 255 }).notNull(),
    repoLogin: varchar("repoLogin", { length: 255 }).notNull(),
    repoName: varchar("repoName", { length: 255 }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    codeUpdatedAt: timestamp("codeUpdatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => {
    return {
      connectorIdRepoId: uniqueIndex(
        "github_code_repositories_connector_id_repo_id"
      ).on(table.repoId, table.connectorId),
    };
  }
);

export const githubCodeFiles = pgTable(
  "github_code_files",
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
    lastSeenAt: timestamp("lastSeenAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    repoId: varchar("repoId", { length: 255 }).notNull(),
    documentId: varchar("documentId", { length: 255 }).notNull(),
    parentInternalId: varchar("parentInternalId", { length: 255 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 255 }).notNull(),
    contentHash: varchar("contentHash", { length: 255 }).notNull(),
    connectorId: integer("connectorId").references(() => connectors.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    codeUpdatedAt: timestamp("codeUpdatedAt", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => {
    return {
      connectorIdRepoIdLastSeenAt: index(
        "github_code_files_connector_id_repo_id_last_seen_at"
      ).on(table.lastSeenAt, table.repoId, table.connectorId),
      connectorIdRepoIdDocumentId: uniqueIndex(
        "github_code_files_connector_id_repo_id_document_id"
      ).on(table.repoId, table.documentId, table.connectorId),
    };
  }
);
