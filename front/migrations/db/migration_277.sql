-- Migration created on Jun 9, 2025 
ALTER TABLE "public"."keys" 
ADD COLUMN "role" VARCHAR(255) DEFAULT 'builder';

-- Update existing system keys to have admin role
UPDATE "keys" SET "role" = 'admin' WHERE "isSystem" = true;