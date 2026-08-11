SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."slack_channels" ADD COLUMN "autoRespondWithoutMentionSkipThreadReplies" boolean DEFAULT false NOT NULL;
