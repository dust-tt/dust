-- Migration created on May 20, 2026

ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "maxFreeUsersInWorkspace" INTEGER NOT NULL DEFAULT -1;

ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "maxLifetimeFreeUsersInWorkspace" INTEGER NOT NULL DEFAULT -1;
