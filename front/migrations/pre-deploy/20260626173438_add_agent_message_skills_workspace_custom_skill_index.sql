CREATE INDEX CONCURRENTLY idx_agent_message_skills_workspace_custom_skill ON public.agent_message_skills USING btree ("workspaceId", "customSkillId") WHERE "customSkillId" IS NOT NULL;
