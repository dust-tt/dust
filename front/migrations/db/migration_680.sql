-- Migration created on Jun 03, 2026
ALTER TABLE "public"."membership_invitations" ADD COLUMN "seatType" VARCHAR(255) DEFAULT NULL;
