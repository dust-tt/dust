SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_message_consumption_items_unique_legacy_action
  ON public.agent_message_consumption_items
  USING btree ("workspaceId", "attributionVersion", "agentMCPActionId")
  WHERE "agentMCPActionId" IS NOT NULL AND "itemType" = 'tool';

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_message_consumption_items_unique_action_item_type
  ON public.agent_message_consumption_items
  USING btree ("workspaceId", "attributionVersion", "agentMCPActionId", "itemType")
  WHERE "agentMCPActionId" IS NOT NULL
    AND "itemType" IN ('tool_call', 'tool_direct', 'tool_result', 'tool_adjustment');

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."agent_message_consumption_items_unique_action";
