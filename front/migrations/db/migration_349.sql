-- Migration created on Aug 27, 2025

-- Add triggerId column to conversations table as an optional foreign key to triggers table
ALTER TABLE conversations 
ADD COLUMN "triggerId" bigint DEFAULT NULL 
REFERENCES "triggers" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for triggerId lookups
CREATE INDEX "conversations_trigger_id" ON "conversations" ("triggerId");

-- Migrate existing conversations with visibility 'triggered' to 'unlisted'. We only used 'triggered' briefly
UPDATE conversations
SET visibility='unlisted'
WHERE visibility='triggered';
