-- First drop the column,
ALTER TABLE "agent_message_feedbacks" DROP COLUMN "agentConfigurationId";
ALTER TABLE "agent_message_feedbacks" ADD COLUMN "agentConfigurationId" VARCHAR(255);
ALTER TABLE "agent_message_feedbacks" ADD COLUMN "agentConfigurationVersion" INTEGER;

ALTER TABLE "agent_message_feedbacks" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "agent_message_feedbacks"  ADD FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_message_feedbacks" 
DROP CONSTRAINT "agent_message_feedbacks_userId_fkey",
ADD CONSTRAINT "agent_message_feedbacks_userId_fkey" 
    FOREIGN KEY ("userId") 
    REFERENCES "users"("id") 
    ON DELETE SET NULL 
    ON UPDATE CASCADE;
