-- Script to run before deployment of copilot->sidekick rename
ALTER TABLE "public"."templates" ADD COLUMN "sidekickInstructions" TEXT;
UPDATE templates SET sidekickInstructions = copilotInstructions;
