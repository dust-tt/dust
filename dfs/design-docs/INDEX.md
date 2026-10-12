# dfs:// master proposal

## Overall architecture

dfs:// (Dust Distributed FileSystem) is a multi-tenant filesystem served by a **Rust server** over
**gRPC / Protobuf**. Applications use this API directly; a **Rust FUSE client** exposes it as a
filesystem mount in sandboxes, letting agents work with files through ordinary filesystem
operations.

It is designed to provide search capabilities on top of regular filesystem operations with a
flexible grant model (assuming high cardinality of grants to support all existing Dust workspace
permission use cases (frames, agents, skills, conversations, pods, ...)). See [API.md](API.md) for
details on this.

It is built on top of:

- **FoundationDB (FDB)** is the transactional source of truth for tenants, sessions, objects, file
  contents, and grants. The server handles authorization and filesystem operations against that
  state.
- **Elasticsearch (ES)** provides an asynchronous search index for contents and metadata, with
  results checked against FDB for freshness and access.

We explored many alternatives to the current architecture, including:

- (i) Single-writer designs on top of RocksDB directly
- (ii) GCP-backed storage with a separate metadata database

(ii) was deemed too slow for our needs and (i), while achieving the best performance, required
building custom high-availability / deployment support. We were able to recover most of the
performance of (i) with our current design by aggressively caching in clients.

We target 1s eventual consistency across clients of a tenant (max 1-2s between my write
and you seeing it).

## API

The [API proposal](API.md) defines gRPC operations, authentication, grant enforcement, filesystem
semantics, and search behavior. The [gRPC proto](../protocol/proto/dfs.proto) defines the service
and message schemas.

## Storage

The [storage proposal](STORAGE.md) defines the FDB key layout, resource records, transaction
boundaries, and planned search indexing.

## URI

The [URI proposal](URI.md) defines stable object references, relative path resolution, and how
applications and sandbox mounts address files.
