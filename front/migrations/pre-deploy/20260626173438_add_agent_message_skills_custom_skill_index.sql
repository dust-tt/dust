CREATE INDEX CONCURRENTLY idx_agent_message_skills_custom_skill ON public.agent_message_skills USING btree ("customSkillId") WHERE "customSkillId" IS NOT NULL;
