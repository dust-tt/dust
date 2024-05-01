UPDATE agent_retrieval_actions SET "agentMessageId"=1 WHERE "agentMessageId" IS NULL;
UPDATE conversations SET visibility='deleted' WHERE id=3;
