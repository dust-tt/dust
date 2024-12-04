-- Drop existing foreign key constraint
ALTER TABLE retrieval_documents
DROP CONSTRAINT retrieval_documents_retrievalactionid_fkey;

-- Allow null and add new foreign key with SET NULL
ALTER TABLE retrieval_documents
ALTER COLUMN "retrievalActionId" DROP NOT NULL,
ADD CONSTRAINT retrieval_documents_retrievalActionId_fkey
  FOREIGN KEY ("retrievalActionId")
  REFERENCES agent_retrieval_actions(id)
  ON DELETE SET NULL;
