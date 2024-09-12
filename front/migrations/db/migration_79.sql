-- Migration created on Sep 12, 2024
ALTER TABLE
    "agent_data_source_configurations"
ADD
    FOREIGN KEY ("dataSourceId") REFERENCES "data_sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE
    "agent_data_source_configurations"
ADD
    FOREIGN KEY ("dataSourceViewId") REFERENCES "data_source_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;