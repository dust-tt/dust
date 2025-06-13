CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_sources_nodes_data_source_text_size
    ON public.data_sources_nodes USING btree
    (data_source ASC NULLS LAST)
    INCLUDE(text_size)
    WITH (deduplicate_items=True);

COMMENT ON INDEX public.idx_data_sources_nodes_data_source_text_size
    IS 'Covering index for aggregating the text_size of a data_source';