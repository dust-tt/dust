ALTER TABLE "agent_message_contents"
  DROP CONSTRAINT "agent_message_contents_agentMessageId_fkey",
  ADD CONSTRAINT "agent_message_contents_agentMessageId_fkey"
    FOREIGN KEY ("agentMessageId")
    REFERENCES "agent_messages"("id")
    ON DELETE RESTRICT
    ON UPDATE RESTRICT;