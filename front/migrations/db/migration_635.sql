-- Migration created on mai 12, 2026
ALTER TABLE "public"."user_project_notification_preferences" ADD COLUMN "isStarred" BOOLEAN DEFAULT NULL;
ALTER TABLE "user_project_notification_preferences" ALTER COLUMN "preference" DROP NOT NULL;
