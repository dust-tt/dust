-- Migration created on Aug 26, 2025
ALTER TABLE slack_channels ADD COLUMN "autoRespondWithoutMention" BOOLEAN NOT NULL DEFAULT false;
