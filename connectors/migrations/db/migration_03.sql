-- Migration created on Jun 24, 2024
ALTER TABLE
    notion_connector_states
ALTER COLUMN
    "useDualWorkflow" DROP NOT NULL;