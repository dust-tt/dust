-- folders

ALTER TABLE data_sources_folders
DROP COLUMN data_source,
DROP COLUMN created,
DROP COLUMN folder_id;