-- Migration created on Jun 01, 2026
ALTER TABLE "public"."membership_invitations" ADD COLUMN "reminderSentAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE INDEX CONCURRENTLY "membership_invitations_created_at_id" ON "membership_invitations" ("createdAt", "id") WHERE "status" = 'pending' AND "reminderSentAt" IS NULL;
