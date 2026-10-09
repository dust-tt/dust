# Helm-rendered deployment configuration fixtures

These files are copied from the infrastructure Helm render at `/tmp/gcs-dfs-render/{relay,worker,canary}.json`. They include the `files/w/workspace-test/` prefix, routed TLS endpoint, canonical DFS directory identifiers and importer writer subject. No credentials are included.

The worker receives `directoryId`, `stagingDirectoryId` and `writerSubject`; the canary receives only `directoryId`. The relay receives none of these fields. Generated JSON schemas and runtime refinements validate all three fixtures. These checks do not validate the DFS server implementation or production Redis durability.
