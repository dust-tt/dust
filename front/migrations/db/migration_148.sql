------------------------------------------
----------- tracker_generations ----------
------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- tracker_generations -> tracker_configurations -> workspaces
UPDATE tracker_generations
SET "workspaceId" = tracker_configurations."workspaceId"
FROM tracker_configurations
WHERE tracker_generations."trackerConfigurationId" = tracker_configurations.id;

------------------------------------------
--- tracker_data_source_configurations ---
------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- tracker_data_source_configurations -> tracker_configurations -> workspaces
UPDATE tracker_data_source_configurations
SET "workspaceId" = tracker_configurations."workspaceId"
FROM tracker_configurations
WHERE tracker_data_source_configurations."trackerConfigurationId" = tracker_configurations.id;