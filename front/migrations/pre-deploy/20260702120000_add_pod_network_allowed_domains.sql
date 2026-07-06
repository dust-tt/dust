ALTER TABLE project_metadata
ADD COLUMN pod_network_allowed_domains TEXT[] DEFAULT '{}' NOT NULL;
