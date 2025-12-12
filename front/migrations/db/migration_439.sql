-- Drop version column from skill_configurations table since versions are now tracked in skill_versions table
ALTER TABLE "skill_configurations" DROP COLUMN IF EXISTS "version";
