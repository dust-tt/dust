SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_step_contents_workspace_id_text_content_idx ON public.agent_step_contents USING btree ("workspaceId", "agentMessageId") WHERE ((type)::text = 'text_content'::text);
