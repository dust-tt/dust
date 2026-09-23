-- Agent editors now use group_permissions, and the legacy group_agents table is empty.
-- Its model and all readers and writers have been removed.
SET lock_timeout = '5s';

DROP TABLE "public"."group_agents";
