# GCS relay and DFS worker deployment contract

Date: 2026-10-09
Status: relay and importer implemented locally; no cloud deployment

This contract aligns the app with `dust-infra-2/docs/gcs-dfs-sync.md`: private uploads only, native subscription, trusted workspace/object keying relay, ordered DFS subscription, and two retained dead-letter queues. There is no historical backfill. The prior million-operation benchmark covers direct delivery only.

The canonical infrastructure design, feature enablement and rollback instructions remain in that file, on the infra branch `jd/gcs-dfs-design`. This app document specifies runtime compatibility; it does not replace the infra design or authorize enabling a cell. Application changes live on `jd/gcs-dfs-sync`; infrastructure remains separately owned, with features disabled and no cloud deployment. The canary and notification/IAM drift code is implemented, but a complete live run and permission-change reconciliation remain rollout gates.

## Processes and image

Both processes use the **workers** target of `dockerfiles/front.Dockerfile`, working directory `/app/front`. The build runs `npm run build:gcs-dfs` after `build:workers`; it includes the relay, importer worker, two-hop canary and existing operator health runner in `dist`. Do not use the front-api image or start a Temporal worker for these deployments.

| Deployment | Command | Required environment |
| --- | --- | --- |
| Relay | `node --enable-source-maps --require dd-trace/init /app/front/dist/start_gcs_dfs_relay.js` | `GCS_DFS_RELAY_CONFIG_PATH=/etc/gcs-dfs/config/relay.json` |
| Importer worker | `node --enable-source-maps --require dd-trace/init /app/front/dist/start_gcs_dfs_worker.js` | `GCS_DFS_WORKER_CONFIG_PATH=/etc/gcs-dfs/config/worker.json` |

The infrastructure feature `gcs_dfs` provisions both hops; `workers_enabled` separately controls the deployments without deleting queues. Keep both native/ordered subscriptions and retained DLQ subscriptions during rollback.

Use separate KSAs and Google Workload Identity. Google ADC supplies cloud access; no service-account JSON keys are required. Mount importer token files read-only only in the importer deployment. Relay routing configuration contains no importer endpoint, token file or reader grants. Helm mounts JSON configs at `/etc/gcs-dfs/config/{relay,worker}.json` and the dedicated importer ExternalSecret at `/etc/gcs-dfs/tokens/<token key>`. Every binding references its exact mounted path through `tokenFile`. Config changes require a rolling restart.

## Configurations

Runtime authority: `front/workers/gcs_dfs/protocol.ts`. Exported JSON schemas: `../import/config/relay.schema.json` and `../import/config/worker.schema.json`, relative to this document. Regenerate from `front` with `npm exec -- tsx scripts/gcs_dfs/export_config_schemas.ts`. Zod additionally enforces nonoverlapping bucket/prefix bindings, exclusive and distinct import directories, disjoint writer/reader subjects, valid loopback emulator ports and regional endpoint/workspace requirements for ordered delivery; these cross-field refinements are not expressible by the generated schemas.

Relay example:

```json
{
  "subscription": "projects/CELL_PROJECT/subscriptions/gcs-dfs-native",
  "topic": "projects/CELL_PROJECT/topics/gcs-dfs-keyed",
  "pubsubEndpoint": "https://europe-west1-pubsub.googleapis.com",
  "environment": "production",
  "cell": "cell-00002",
  "healthPort": 3001,
  "concurrency": 8,
  "leaseSeconds": 60,
  "requestTimeoutMs": 30000,
  "drainTimeoutMs": 60000,
  "livenessTimeoutMs": 300000,
  "bindings": [{
    "bucket": "PRIVATE_UPLOADS_BUCKET",
    "prefix": "files/w/WORKSPACE_ID/",
    "workspaceId": "WORKSPACE_ID",
    "notificationConfigs": ["projects/_/buckets/PRIVATE_UPLOADS_BUCKET/notificationConfigs/NOTIFICATION_ID"]
  }]
}
```

Importer example:

```json
{
  "subscription": "projects/CELL_PROJECT/subscriptions/gcs-dfs-ordered",
  "pubsubEndpoint": "https://europe-west1-pubsub.googleapis.com",
  "orderedDelivery": true,
  "environment": "production",
  "cell": "cell-00002",
  "healthPort": 3001,
  "concurrency": 8,
  "leaseSeconds": 60,
  "requestTimeoutMs": 30000,
  "drainTimeoutMs": 60000,
  "livenessTimeoutMs": 300000,
  "bindings": [{
    "bucket": "PRIVATE_UPLOADS_BUCKET",
    "prefix": "files/w/WORKSPACE_ID/",
    "workspaceId": "WORKSPACE_ID",
    "tenant": "DFS_TENANT",
    "endpoint": "https://DFS_GRPC_HOST:9841",
    "tokenFile": "/etc/gcs-dfs/tokens/WORKSPACE_TOKEN_KEY",
    "directoryId": "0190c3a0b1c27d4e8f0a1b2c3d4e5f60",
    "stagingDirectoryId": "0190c3a0b1c27d4e8f0a1b2c3d4e5f61",
    "writerSubject": "gcs-importer",
    "readers": ["EXPLICIT_TEST_READER"],
    "notificationConfigs": ["projects/_/buckets/PRIVATE_UPLOADS_BUCKET/notificationConfigs/NOTIFICATION_ID"]
  }]
}
```

These prefixes are illustrative; infrastructure must receive trusted bindings matching actual private-upload object names. It must not infer workspace identity from arbitrary event metadata. Multiple bindings may use the same tenant only when authorized by the app's workspace mapping. Unknown mappings remain unacknowledged for retry/dead lettering. Empty `readers` grants no consumer access; the importer retains rw. Reader strings are exact DFS subjects, not hashes or bearer keys.

`pubsubEndpoint` is an HTTPS origin with no trailing slash, port, credentials or path. It applies to publish, pull, acknowledgements and lease renewal. Use the cell's regional endpoint on both processes. `pubsubEmulatorHost` is optional and accepts only a loopback host/port; never set it in cloud deployments. Global Pub/Sub and `orderedDelivery: false` are retained only for the direct-delivery prototype. Explicitly set `orderedDelivery: true` in Helm.

The relay key is `gcs-workspace-object-v1:` plus hexadecimal SHA-256 of UTF-8 `JSON.stringify([workspaceId, objectName])`. Exact names are preserved; generation is excluded. Bucket and generation remain in the envelope and DFS cursor. Workers recompute and validate the ordering key. Both processes serialize same-key messages within pulled batches; different keys share bounded worker slots. Coalescing is not enabled in this implementation.

## HTTP probes and shutdown

Both processes listen on `0.0.0.0:3001` by default, configurable with `healthPort`. Use the implemented `/livez` and `/readyz` paths; `/healthz/live` and `/healthz/ready` are not served. Only `GET /livez` and `GET /readyz` are served; responses contain a boolean and return 200 or 503. Do not expose this listener through public ingress.

- `/livez` requires processing/transport progress within `livenessTimeoutMs`, default 300000. Failed processing/transport attempts count as progress, so temporary backend outages do not trigger restart loops. Lease renewal alone does not count: it must not hide a stuck handler.
- `/readyz` requires a successful pull, no unresolved observed transport failures, successful backend checks and a process that is not draining. Importer checks Redis availability, exact configured directory grants, live GCS metadata and the authenticated DFS cursor for a reserved `.dust-gcs-dfs-readiness` name under each binding every 30 seconds, concurrency four. These checks do not write or list objects. An absent source object is valid; a permission failure is not.
- Relay readiness confirms input consumption. Publish authority is observed when an event is published; empty-queue readiness does not certify destination publish IAM. A native-event canary must qualify that path. No extra topic-admin or IAM-read permissions are required for process probes.

Suggested Kubernetes probes: startup `/livez`, period 5 seconds, failure threshold 12; liveness `/livez`, period 10 seconds, failure threshold 3; readiness `/readyz`, period 10 seconds, failure threshold 3; timeout 2 seconds each.

SIGTERM/SIGINT immediately mark readiness false, stop new admission, and drain admitted handlers while renewing leases. A pull that completes after shutdown returns its messages with zero acknowledgement deadline. `drainTimeoutMs` defaults to 60000; unfinished handlers exit nonzero at that deadline without acknowledging work. Set `terminationGracePeriodSeconds: 90` for the default drain timeout; preserve at least 15 seconds of margin if that timeout changes. Avoid a sleeping preStop hook consuming that budget. Liveness progress includes chunk staging, so long but advancing imports remain live.

## Metrics

Use the existing DogStatsD agent integration (`DD_AGENT_HOST`, `DD_DOGSTATSD_PORT`, `DD_ENTITY_ID`, plus usual `DD_ENV`, `DD_SERVICE`, `DD_VERSION`). No Datadog API key is required in either process. Application metrics use bounded tags: `environment`, `cell`, `component` (`relay` or `importer`), `operation`, `outcome`, `error_class`. Workspace, bucket, object, message and generation identifiers are never metric tags.

| Metric | Type | Meaning |
| --- | --- | --- |
| `gcs_dfs.operations` | Counter | Observed operations and outcomes |
| `gcs_dfs.duration_ms` | Distribution | Completed-operation duration where recorded |
| `gcs_dfs.bytes` | Counter | Source body bytes received or chunk bytes staged; select `operation` to distinguish them |

Operations: `receive`, `pull`, `lease`, `acknowledge`, `relay_publish`, `message`, `source_metadata`, `source_content`, `dfs_cursor`, `dfs_stage`, `dfs_publish`, `cas_retry`, `create`, `update`, `delete`. Outcomes: `success`, `error`, `applied`, `stale`. `receive` counts delivered messages admitted to a batch, including invalid messages and later deferred same-key messages. `message` measures attempted handling including acknowledgement; `create/update/delete` measures DFS publication before acknowledgement. Source chunk receipt is not a source-object operation count. Retries and crashes can repeat successful transport metrics. `stale` denotes an equal/already-applied observation, not proof that a notification ID was duplicated.

Error classes: `none`, `notification_identity_mismatch`, `ordering_key_mismatch`, `missing_workspace`, `unmapped_source`, `object_too_large`, `content_size_mismatch`, `source_version_mismatch`, `metadata_too_large`, `invalid_import_token`, `response_too_large`, `source_cursor_changed`, `invalid_input`, `transport_or_runtime`. Select the operation to distinguish source, DFS and broker failures.

Measure both subscriptions' backlog age/count and both DLQs through the Google Cloud Datadog integration. The app does not pretend to know broker backlog or exact redelivery counts. Canary metrics and additional producer/checker components are specified separately in the canary contract. There is no standalone retries metric.

## Monitor and autoscaling selectors

Always select `environment:<environment>`, `cell:<cell>` and `component:relay` or `component:importer` for app metrics. Select one operation to avoid counting the same failure at both transport and handler boundaries.

| Signal | App metric and additional tags |
| --- | --- |
| Received deliveries | `gcs_dfs.operations`, `operation:receive,outcome:success` |
| Relay publications | `gcs_dfs.operations`, `component:relay,operation:relay_publish,outcome:success` |
| Handler failures | `gcs_dfs.operations`, `operation:message,outcome:error` |
| Unknown mappings | Handler failures with `error_class:unmapped_source` |
| Invalid notifications | Handler failures with `error_class:invalid_input` or `notification_identity_mismatch` |
| Ack or lease failures | `gcs_dfs.operations`, `operation:acknowledge` or `lease`, `outcome:error` |
| Cursor retries (legacy metric name) | `gcs_dfs.operations`, `component:importer,operation:cas_retry,outcome:error` |
| Applied creates, updates or deletes | `gcs_dfs.operations`, `component:importer,operation:create` or `update` or `delete`, `outcome:applied` |
| Equal-state completions | `gcs_dfs.operations`, `component:importer,operation:message,outcome:stale` |
| Handling latency | `gcs_dfs.duration_ms`, `operation:message` |

For backlog-driven autoscaling, use `gcp.pubsub.subscription.num_undelivered_messages`, scoped separately to the native relay subscription and ordered importer subscription. Alert on `gcp.pubsub.subscription.oldest_unacked_message_age` for both. On each retained DLQ subscription, alert on `gcp.pubsub.subscription.num_undelivered_messages > 0`; `gcp.pubsub.subscription.dead_letter_message_count` on the source subscriptions measures forwarding activity. [Datadog Pub/Sub metrics](https://docs.datadoghq.com/integrations/google-cloud-pubsub/)

An external-metrics adapter or equivalent controller must expose the broker metric to HPA. These workers do not expose Prometheus metrics or backlog gauges. Keep replica ceilings explicit; more replicas do not accelerate one hot ordering key. Measure a backlog-per-replica target before production rollout. Scope cloud metrics by actual project/subscription resource tags; app `component` tags are not automatically present on cloud metrics.

NetworkPolicy must also permit DNS, the configured DogStatsD agent transport, and importer-to-DFS TLS traffic. The relay needs regional Pub/Sub and ADC metadata access; the importer additionally reads `storage.googleapis.com` and its configured DFS endpoint. Neither process needs direct FDB access.

## Canary and permission boundary

The production two-hop canary is `dist/check_gcs_dfs_canary.js`, configured through `GCS_DFS_CANARY_CONFIG_PATH`. Its full scheduler, JSON, secret, IAM, network and metric contract is [CANARY_CONTRACT.md](CANARY_CONTRACT.md). The generated schema is [canary.schema.json](../import/config/canary.schema.json).

The checker runs in front application context and uses normal `FileResource` create/upload/update/delete methods. It verifies exact nonce bytes, denial to a second valid reader, deletion, and both hops' configuration and IAM. It requires front database configuration and source-write permissions, unlike the relay/importer. Keep it in a separate CronJob and identity. The older `check_gcs_dfs_health.js` remains an operator tool for the direct-delivery prototype.

The importer still requires trusted explicit reader mappings. The canary uses separate reader session keys through the canonical DFS gRPC protocol; it does not qualify production permission-change reconciliation or revocation. No cloud deployment has been performed.

## DFS protocol and transport

The canonical API is [dfs/design-docs/API.md](../../../../dfs/design-docs/API.md), with the typed protobuf service in [dfs/protocol/proto/dfs.proto](../../../../dfs/protocol/proto/dfs.proto). Application callers reuse `front/lib/dfs/DfsClient` and `DfsGrpcTransport`. They authenticate each unary `/dfs.v1.Dfs/<Method>` call with `authorization: Bearer <key>` metadata. Application errors use the canonical gRPC status and protobuf `ErrorDetails` mapping; the shared client returns `Result` values.

The earlier handoff based on the `x/jd/dfs` PoC was incorrect and is superseded. Its Frame/bincode client, appended import variants, importer credential-hash allowlist and special reader interface have been removed from this work. The historical PoC test results do not validate the canonical service.

`endpoint` retains the no-path `https://host:port` representation. The reader adapter supplies `host:port` and `useTls: true` to the shared transport. Only loopback test endpoints may use `http://`. Channels are reused per configured endpoint; there is no arbitrary endpoint-count failure. Kubernetes process probes remain separate HTTP endpoints on port 3001.

At the reviewed `origin/main` revision `d1ccce8f03`, `dfs/server` accepts `--listen` / `DFS_LISTEN` (default `127.0.0.1:50051`) and `--fdb-cluster-file` / `FDB_CLUSTER_FILE`. Its listener is plaintext gRPC; the checked-in server has no TLS-certificate flags, importer-token flags, namespace flag or credential-file flag. A deployed `https://` endpoint therefore requires TLS termination or future native TLS support. Do not reuse the old PoC command line. The infrastructure's routed port remains deployment-supplied.

Server handlers are expected to be implemented before shipment. The protocol is unchanged. Import uses existing `CreateSession`, `RevokeSession`, `Stat`, `ListGrants`, `Lookup` and `Apply`, through the shared client. Every `Apply` contains one operation, avoiding partial-batch success hazards. Content uses at most 64 KiB per write and a 256 MiB object limit. The fully written private file receives source cursor and metadata xattrs before one `Rename(replace=true)` atomically publishes it. Readers inherit final-directory permissions at rename. A delete uses one `Remove`; namespace absence is its durable state, with no separate tombstone record. Lost mutation responses are not replayed: session revocation fences outstanding mutations before a fresh attempt reads DFS and live GCS.

The importer additionally requires `REDIS_URI`, through the existing stream Redis client, and restricted TCP egress to that destination. Helm must inject this variable only into the importer from Kubernetes Secret `front-gcs-dfs-secrets-v2`, key `REDIS_URI`, backed by Secret Manager secret `front-gcs-dfs-REDIS_URI` with `component=front-gcs-dfs`. The importer must not inherit unrelated front secrets. `gcs_dfs.redis_egress` permits only explicit `/32` destinations on TCP 6379 or 6380. This wiring neither provisions Redis nor establishes its durability. The importer does not use `REDIS_CACHE_URI`. Every binding now requires `directoryId`, `stagingDirectoryId` (distinct 32-character lowercase UUIDv7 hex IDs), and `writerSubject` (nonempty, at most 512 characters, distinct from all reader subjects). `tokenFile` holds a 64-character **tenant key**, used only by the importer for session creation/revocation and read-only grant inspection. It is not a PoC import token or consumer session key. A separate ephemeral writer session is created and registered for each source attempt.

Both directories must be provisioned before enablement. Each has explicit `DENY rw` and `ALLOW writerSubject rw`; the final directory additionally has exactly `ALLOW reader r` for every distinct configured reader. No other explicit grant is accepted. Staged files receive no explicit grants. The worker verifies grants before reading GCS and never changes them. Directory provisioning and reader-policy reconciliation belong to trusted enrollment tooling. Grant drift fails the attempt closed. These directories must be exclusively managed by the importer, and trusted administrators must coordinate directory or grant changes with a worker drain.

Redis coordinates a SHA-256 key over `[tenant,bucket,objectName]`, independent of generation and Pub/Sub receipt order. The lease is 60 seconds, renewed every 20 seconds and checked before each mutation. Lease expiry permits takeover but never deletes the previous session ID. The successor first calls `RevokeSession` and waits for admitted mutations to drain, then registers its own session before reading the cursor and live source. Ownership uses Redis server time and owner-checked Lua operations. Revoked records are removed after clean completion; uncertain records remain without TTL until a successor fences the previous session. Failed or ambiguous Redis operations leave the message unacknowledged.

**Deployment prerequisite:** Redis ownership history must not be evicted, flushed, or rolled back during automatic failover. Ordinary disposable cache semantics are insufficient. Following Redis data loss or rollback, stop all importer instances and fence their DFS sessions before restarting with empty coordination state. All importers for a tenant/source must share the same coordination Redis and authoritative DFS session domain, including across endpoint aliases. Current DFS sessions are server-local, so routing must preserve that session domain. Tenant-key rotation must preserve revocation authority. These conditions are necessary for the concurrency guarantee; a renewable Redis lease alone is not fencing.

The canary uses provisioned, current 64-character session keys, `CurrentSession`, `Lookup` under the binding's `directoryId`, and `Read`. It does not need `stagingDirectoryId`, `writerSubject`, Redis ownership, or the tenant key. Its reader checks run before producer allocation. A forbidden read is accepted as denial only after another successful same-tenant `CurrentSession`; authentication failures remain failures. The read response supplies content and attributes from one snapshot. The canary does not revoke externally provisioned sessions. Session expiry/renewal must be handled during credential provisioning.

A process failure can leave private staged files. They are never automatically published or made readable to consumer subjects. Operational cleanup must drain importers and remove only verified staging artifacts; no periodic inventory repair or garbage collection is introduced here.

The workers image includes the actual protobuf file and the shared client's runtime lookup file. The source schema remains authoritative; no copied wire codec is generated for the GCS worker.

## Validation boundary

Current application validation passes 132 tests, full front TypeScript checking, targeted lint/format checks and builds for all four entrypoints. Ten real-Redis and canonical-protobuf gRPC fixture tests cover expired-owner fencing, admitted mutation draining, ambiguous publication, per-operation errors, grant drift and stale ownership actions. They are not tests of the unfinished canonical server or real FDB. Fresh infrastructure renders of relay, worker and canary configurations pass both the generated JSON schemas and runtime refinements. Configuration tests validate only the rendered configuration. Shared-client and canary gRPC tests validate the canonical typed protobuf service independently. The earlier 91-test suite and three PoC FDB tests were against the superseded protocol and must not be treated as current server evidence. No production cell has been enabled or deployed. Full workers-image validation, the normal-front/native-GCS/two-hop canary and permission reconciliation remain rollout gates.
