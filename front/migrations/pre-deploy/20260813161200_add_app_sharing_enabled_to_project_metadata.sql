/*
Add appSharingEnabled to project_metadata for opt-in Pod app sharing (every
workspace member may invoke the Pod's published functions and use its shared
Frames, with no read/write on the Pod). Default false.

Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_metadata" ADD COLUMN "appSharingEnabled" BOOLEAN NOT NULL DEFAULT false;
