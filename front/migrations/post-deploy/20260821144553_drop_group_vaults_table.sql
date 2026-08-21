/*
Drop the `group_vaults` table.

Nothing reads or writes it anymore: a space's associated groups are modeled by `group_permissions`
(PRs #30890 / #30899 / #30947). This is post-deploy — it must run only after the code that stopped
using the table is live. DROP TABLE also removes the table's own indexes and foreign-key
constraints; nothing references `group_vaults` from another table.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP TABLE "public"."group_vaults";
