-- Migration created on Mar 31, 2026
CREATE TABLE IF NOT EXISTS "global_feature_flags" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "name" VARCHAR(255) NOT NULL, "rolloutPercentage" INTEGER NOT NULL DEFAULT 100, "id"  BIGSERIAL , PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "global_feature_flags_name" ON "global_feature_flags" ("name");
