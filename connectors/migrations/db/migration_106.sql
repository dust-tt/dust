-- Migration created on Jan 12, 2025
ALTER TABLE "slack_configurations" ADD COLUMN "feedbackVisibleToAuthorOnly" BOOLEAN NOT NULL DEFAULT true;
