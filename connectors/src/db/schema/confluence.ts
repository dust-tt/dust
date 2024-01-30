import { relations } from "drizzle-orm";
import {
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { connectors } from "@connectors/db/schema/connectors";

// /!\ The schema files SHOULD NOT contain any runtime logic besides defining your DB schema.

export const confluenceConfigurations = pgTable(
  "confluence",
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

    cloudId: varchar("cloudId", {
      length: 256,
    }).notNull(),

    url: varchar("url", { length: 256 }).notNull(),

    userAccountId: varchar("userAccountId", { length: 256 }).notNull(),

    connectorId: integer("connectorId").references(() => connectors.id),
  },
  (table) => {
    return {
      connectorIdFk: uniqueIndex("confluence_configurations_connector_id").on(
        table.connectorId
      ),
      userAccountIdIdx: uniqueIndex(
        "confluence_configurations_user_account_id"
      ).on(table.userAccountId),
    };
  }
);

export const confluenceConfigurationRelations = relations(
  connectors,
  ({ one }) => ({
    connector: one(confluenceConfigurations, {
      fields: [connectors.id],
      references: [confluenceConfigurations.connectorId],
    }),
  })
);

export type ConfluenceConfiguration =
  typeof confluenceConfigurations.$inferSelect; // return type when queried
export type NewConfluenceConfiguration =
  typeof confluenceConfigurations.$inferInsert; // insert type
