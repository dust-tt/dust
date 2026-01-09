-- Migration created on Jan 08, 2026
-- Phase 4 of doc-tracker removal: Drop tracker tables
-- This must run AFTER Phase 2 (data deletion) and Phase 3 (code removal)

-- Drop tables in order respecting foreign key constraints
DROP TABLE IF EXISTS tracker_generations;
DROP TABLE IF EXISTS tracker_data_source_configurations;
DROP TABLE IF EXISTS tracker_configurations;
