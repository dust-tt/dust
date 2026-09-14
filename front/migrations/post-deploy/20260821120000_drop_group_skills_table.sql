-- Drop the group_skills table.
--
-- Skill editors are per-user "editor" grants in group_permissions, held by one regular_auto group
-- per skill. The skill_editors groups this table used to link have been deleted, and no code reads
-- or writes it anymore. Rows still pointing at agent_editors groups are dead too: those groups are
-- no longer attached to any skill.
SET lock_timeout = '5s';

DROP TABLE "public"."group_skills";
