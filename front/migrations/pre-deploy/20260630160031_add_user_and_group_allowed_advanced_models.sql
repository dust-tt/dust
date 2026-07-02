SET
	lock_timeout = '5s';

CREATE TABLE
	"public"."group_allowed_advanced_models" (
		"createdAt" TIMESTAMP
		WITH
			TIME ZONE NOT NULL DEFAULT NOW (),
			"updatedAt" TIMESTAMP
		WITH
			TIME ZONE NOT NULL DEFAULT NOW (),
			"groupId" BIGINT NOT NULL REFERENCES "public"."groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
			"workspaceId" BIGINT NOT NULL REFERENCES "public"."workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
			"providerId" VARCHAR(255) NOT NULL,
			"modelId" VARCHAR(255) NOT NULL,
			"id" BIGSERIAL,
			PRIMARY KEY ("id")
	);

CREATE INDEX CONCURRENTLY "group_allowed_advanced_models_group_id" ON "public"."group_allowed_advanced_models" ("groupId");

CREATE INDEX CONCURRENTLY "group_allowed_advanced_models_workspace_id_group_id" ON "public"."group_allowed_advanced_models" ("workspaceId", "groupId");

CREATE UNIQUE INDEX CONCURRENTLY "group_allowed_advanced_models_workspace_id_group_id_provider_id" ON "public"."group_allowed_advanced_models" ("workspaceId", "groupId", "providerId", "modelId");

CREATE TABLE
	"public"."user_allowed_advanced_models" (
		"createdAt" TIMESTAMP
		WITH
			TIME ZONE NOT NULL DEFAULT NOW (),
			"updatedAt" TIMESTAMP
		WITH
			TIME ZONE NOT NULL DEFAULT NOW (),
			"userId" BIGINT NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
			"workspaceId" BIGINT NOT NULL REFERENCES "public"."workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
			"providerId" VARCHAR(255) NOT NULL,
			"modelId" VARCHAR(255) NOT NULL,
			"id" BIGSERIAL,
			PRIMARY KEY ("id")
	);

CREATE INDEX CONCURRENTLY "user_allowed_advanced_models_user_id" ON "public"."user_allowed_advanced_models" ("userId");

CREATE INDEX CONCURRENTLY "user_allowed_advanced_models_workspace_id_user_id" ON "public"."user_allowed_advanced_models" ("workspaceId", "userId");

CREATE UNIQUE INDEX CONCURRENTLY "user_allowed_advanced_models_unique_idx" ON "public"."user_allowed_advanced_models" ("workspaceId", "userId", "providerId", "modelId");

CREATE TABLE
	"public"."workspace_allowed_advanced_models" (
		"createdAt" TIMESTAMP
		WITH
			TIME ZONE NOT NULL DEFAULT NOW (),
			"updatedAt" TIMESTAMP
		WITH
			TIME ZONE NOT NULL DEFAULT NOW (),
			"workspaceId" BIGINT NOT NULL REFERENCES "public"."workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
			"providerId" VARCHAR(255) NOT NULL,
			"modelId" VARCHAR(255) NOT NULL,
			"id" BIGSERIAL,
			PRIMARY KEY ("id")
	);

CREATE INDEX CONCURRENTLY "workspace_allowed_advanced_models_workspace_id" ON "public"."workspace_allowed_advanced_models" ("workspaceId");

CREATE UNIQUE INDEX CONCURRENTLY "group_allowed_advanced_models_unique_idx" ON "public"."workspace_allowed_advanced_models" ("workspaceId", "providerId", "modelId");