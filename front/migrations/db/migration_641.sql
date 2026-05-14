ALTER TABLE "public"."memberships"
  ADD COLUMN "pendingDowngradeSeatType" VARCHAR(255),
  ADD COLUMN "pendingDowngradeAt"       TIMESTAMP WITH TIME ZONE;
