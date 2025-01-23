-- Migration created on Jan 23, 2025
ALTER TABLE "public"."conversation_participants" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."user_messages" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."agent_messages" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."messages" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."message_reactions" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."mentions" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;