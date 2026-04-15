-- Migration: Simplify project_todo categories from 4 to 2
--
-- Old categories → new categories:
--   follow_ups       → to_do
--   need_attention   → to_know
--   key_decisions    → to_know
--   notable_updates  → to_know

-- Update project_todos table
UPDATE project_todos SET category = 'to_do' WHERE category = 'follow_ups';
UPDATE project_todos SET category = 'to_know' WHERE category IN ('need_attention', 'key_decisions', 'notable_updates');

-- Update project_todo_versions table
UPDATE project_todo_versions SET category = 'to_do' WHERE category = 'follow_ups';
UPDATE project_todo_versions SET category = 'to_know' WHERE category IN ('need_attention', 'key_decisions', 'notable_updates');
