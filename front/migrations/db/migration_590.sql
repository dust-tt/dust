-- Migration created on Apr 17, 2026
-- Drop the trigger_subscribers table after removing trigger subscription dead-code.

DROP TABLE IF EXISTS trigger_subscribers;
