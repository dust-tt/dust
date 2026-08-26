SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_message_consumption_items_rounding_version_created_at
  ON public.agent_message_consumption_items
  USING btree ("attributionVersion", "createdAt", id)
  WHERE "itemType" = 'rounding';
