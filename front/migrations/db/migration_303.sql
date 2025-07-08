-- Migration created on Jul 08, 2025
ALTER TABLE "public"."users" DROP COLUMN "provider";
ALTER TABLE "public"."users" DROP COLUMN "providerId";
ALTER TABLE "public"."users" DROP COLUMN "auth0Sub";
