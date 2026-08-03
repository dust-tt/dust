-- Drop the project_default_skills mapping table.
--
-- Pod default skills are now stored in the defaultSkillsIds column on the project_metadata 
-- table, so the mapping table that originally linked a pod to its default skills is no longer
-- read or written by any code.
SET lock_timeout = '5s';

DROP TABLE "public"."project_default_skills";
