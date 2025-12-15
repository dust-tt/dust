-- Migration: Remove creditAlertIdempotencyKey from workspace metadata
-- This key is no longer needed as the credit alert threshold ID is now computed JIT.

UPDATE workspaces
SET metadata = metadata - 'creditAlertIdempotencyKey'
WHERE metadata ? 'creditAlertIdempotencyKey';
