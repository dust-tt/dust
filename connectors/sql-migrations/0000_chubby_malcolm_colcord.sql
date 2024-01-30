CREATE TABLE IF NOT EXISTS "connectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"type" varchar(256) NOT NULL,
	"connectionId" varchar(256) NOT NULL,
	"workspaceAPIKey" varchar(256) NOT NULL,
	"workspaceId" varchar(256) NOT NULL,
	"dataSourceName" varchar(256) NOT NULL,
	"lastSyncStatus" varchar(256),
	"errorType" varchar(256),
	"lastSyncStartTime" timestamp with time zone,
	"lastSyncFinishTime" timestamp with time zone,
	"lastSyncSuccessfulTime" timestamp with time zone,
	"firstSuccessfulSyncTime" timestamp with time zone,
	"firstSyncProgress" varchar,
	"lastGCTime" varchar
);
