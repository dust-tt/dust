# Elasticsearch-backed skill search

The current design, mapping, permission invariants, query flow, pagination and
repair assumptions are maintained in [the skill search README](../front/lib/skill_search/README.md).

The original PoC split projects/pods from other spaces and merged globals in the
client. The current implementation uses resolved space grants for every space,
canonical candidate validation, and server-side pagination across indexed and
code-defined skills. See the README for those changes and their remaining
production-scale validation requirements.
