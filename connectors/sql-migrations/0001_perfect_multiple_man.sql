CREATE TABLE IF NOT EXISTS "confluence" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"cloudId" varchar(256) NOT NULL,
	"url" varchar(256) NOT NULL,
	"userAccountId" varchar(256) NOT NULL,
	"connectorId" integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "confluence_configurations_connector_id" ON "confluence" ("connectorId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "confluence_configurations_user_account_id" ON "confluence" ("userAccountId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connectors_workspace_id_data_source_name" ON "connectors" ("workspaceId","dataSourceName");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "confluence" ADD CONSTRAINT "confluence_connectorId_connectors_id_fk" FOREIGN KEY ("connectorId") REFERENCES "connectors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
