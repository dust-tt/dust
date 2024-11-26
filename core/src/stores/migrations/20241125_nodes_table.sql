-- folders
CREATE TABLE data_sources_folders (
    id                           BIGSERIAL PRIMARY KEY,
    data_source                  BIGINT NOT NULL,
    created                      BIGINT NOT NULL,
    folder_id                    TEXT NOT NULL,
    FOREIGN KEY(data_source)    REFERENCES data_sources(id)
);

CREATE UNIQUE INDEX idx_data_sources_folders_data_source_folder_id ON data_sources_folders(data_source, folder_id);

-- data sources nodes
CREATE TABLE data_sources_nodes (
    id                           BIGSERIAL PRIMARY KEY,
    created                      BIGINT NOT NULL,
    data_source                  BIGINT NOT NULL,
    timestamp                    BIGINT NOT NULL,
    node_id                      TEXT NOT NULL,
    title                        TEXT NOT NULL,
    mime_type                    TEXT NOT NULL,
    parents                      TEXT[] NOT NULL,
    document                     BIGINT,
    "table"                      BIGINT,
    folder                       BIGINT,
    FOREIGN KEY(data_source)    REFERENCES data_sources(id),
    FOREIGN KEY(document)       REFERENCES data_sources_documents(id),
    FOREIGN KEY("table")          REFERENCES tables(id),
    FOREIGN KEY(folder)         REFERENCES data_sources_folders(id),
    CONSTRAINT data_sources_nodes_document_id_table_id_folder_id_check CHECK (
        (document IS NOT NULL AND "table" IS NULL AND folder IS NULL) OR
        (document IS NULL AND "table" IS NOT NULL AND folder IS NULL) OR
        (document IS NULL AND "table" IS NULL AND folder IS NOT NULL)
    )
);

CREATE UNIQUE INDEX idx_data_sources_nodes_data_source_node_id ON data_sources_nodes(data_source, node_id);
CREATE INDEX idx_data_sources_nodes_parents_array ON data_sources_nodes USING gin(parents);
