SET
	lock_timeout = '5s';

DELETE FROM "public"."workspace_allowed_advanced_models"
WHERE
	"providerId" = 'dust_internal'
	AND "modelId" = 'advanced_models_allowlist_configured';

ALTER TABLE "public"."workspace_allowed_advanced_models"
ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT TRUE;