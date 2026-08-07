/*
Add isAdminControlled to project_metadata for opt-in admin-controlled Pods
(membership + connected data managed by workspace admins). Default false.

Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_metadata" ADD COLUMN "isAdminControlled" BOOLEAN NOT NULL DEFAULT false;
