/*
We want to auto send a reminder for un-consumed invitations > this is to track which one was already resent. 
*/
SET SESSION statement_timeout = 3000;

SET SESSION lock_timeout = 3000;

ALTER TABLE "public"."membership_invitations" ADD COLUMN "reminderSentAt" timestamp with time zone;