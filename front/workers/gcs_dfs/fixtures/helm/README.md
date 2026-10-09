# Deployment configuration fixtures

These fixtures originated from the infrastructure Helm render in `/tmp/gcs-dfs-render` with the `files/w/workspace-test/` prefix and routed TLS endpoint. The application fixtures now add the canonical DFS directory identifiers and writer subject required by Redis-coordinated import. A fresh infrastructure render must confirm these additions before enablement. No credentials are included.

Relay configuration is unchanged. Worker and canary JSON are checked against both generated schemas and runtime refinements. These checks do not validate the DFS server implementation or production Redis durability.
