-- Migration created on Jun 20, 2024
ALTER TABLE "public"."user_messages" ADD COLUMN "userContextOrigin" VARCHAR(255);
