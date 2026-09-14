/*
Statement 0
  - DELETES_DATA: A space's members are its manual member list plus the members of the groups
    attached to it. The two used to be exclusive and this column picked which one applied; nothing
    reads or writes it anymore.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."vaults" DROP COLUMN IF EXISTS "managementMode";
