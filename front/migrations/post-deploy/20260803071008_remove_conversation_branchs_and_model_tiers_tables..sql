SET
  SESSION statement_timeout = 1200000;

SET
  SESSION lock_timeout = 3000;

-- Need to run the 20260803_delete_branch_messages migration to delete the branch messages first.
DROP TABLE "public"."conversation_branches";

DROP TABLE "public"."group_allowed_advanced_models";

DROP TABLE "public"."user_allowed_advanced_models";

DROP TABLE "public"."workspace_allowed_advanced_models";