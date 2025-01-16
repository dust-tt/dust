UPDATE data_sources_nodes dsn
SET source_url = dsd.source_url
FROM data_sources_documents dsd
WHERE dsn.document = dsd.id
  AND dsn.document IS NOT NULL;
