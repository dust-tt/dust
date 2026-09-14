/*
Drop the `group_vaults` foreign keys constraints.

Nothing reads or writes it anymore: a space's associated groups are modeled by `group_permissions`
(PRs #30890 / #30899 / #30947). This is post-deploy — it must run only after the code that stopped
using the table is live.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_vaults" DROP CONSTRAINT "group_vaults_groupId_fkey";
ALTER TABLE "public"."group_vaults" DROP CONSTRAINT "group_vaults_vaultId_fkey";
ALTER TABLE "public"."group_vaults" DROP CONSTRAINT "group_vaults_workspaceId_fkey";
