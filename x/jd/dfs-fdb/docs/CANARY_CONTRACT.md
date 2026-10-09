# GCS DFS production canary deployment contract

This contract covers the normal-front-write canary and the independent two-hop drift checks. Relay/importer deployment remains defined in [DEPLOYMENT_CONTRACT.md](DEPLOYMENT_CONTRACT.md). This is implemented application code, not evidence of a successful live deployment.

The canonical infrastructure design and enable/rollback instructions remain `dust-infra-2/docs/gcs-dfs-sync.md`, on branch `jd/gcs-dfs-design`. The current infra implementation leaves the canary unscheduled. Live canary/drift validation and permission-change reconciliation remain rollout gates; this contract does not enable them or replace those gates.

## Scheduler and image

Use the front **workers** image built by `dockerfiles/front.Dockerfile`. `npm run build:gcs-dfs` includes this bundle. Run from `/app/front`:

```sh
node --enable-source-maps --require dd-trace/init /app/front/dist/check_gcs_dfs_canary.js
```

Set `GCS_DFS_CANARY_CONFIG_PATH=/etc/gcs-dfs/config/canary.json`. The process exits 0 only when all checks and cleanup pass, and 1 otherwise. It flushes DogStatsD before exiting. It is a one-shot job with no HTTP probes. Start with a ten-minute schedule, `concurrencyPolicy: Forbid`, `backoffLimit: 0`, `activeDeadlineSeconds: 1200` and `terminationGracePeriodSeconds: 90`. SIGTERM stops subsequent writes and requests cleanup after the current operation; a hung front dependency can still require Kubernetes termination. Schedule it only when workers are enabled. Keep its feature gate separate so it can be suspended without deleting queues.

The producer runs inside front application context with the existing `Authenticator` and `FileResource` methods. It needs the cell's normal front environment and database access; the minimal relay/importer environment is insufficient. It does not call the public upload HTTP endpoint, which rejects overwrite of an already uploaded file. It uses `FileResource.makeNew`, `uploadContent` for both create and overwrite, and `delete` for cleanup. Its files are unattached conversation files in a dedicated test workspace, with unique names. No conversation ID, API key, WorkOS session, bucket listing or inventory scan is required. This exercises application storage methods, not front HTTP authentication or multipart parsing.

## Configuration

The authoritative generated JSON schema is [canary.schema.json](../import/config/canary.schema.json). Unknown fields, importer tokens, global Pub/Sub endpoints, shared queue IDs, identical reader-token paths and prefixes other than `files/w/<workspaceId>/` are rejected. Use one explicitly enrolled test workspace per scheduled job. Supply its same bucket, prefix, tenant, endpoint, final `directoryId` and notification IDs used by the importer binding, but never its importer token.

```json
{
  "environment": "production",
  "cell": "eu",
  "pubsubEndpoint": "https://europe-west1-pubsub.googleapis.com",
  "requestTimeoutMs": 30000,
  "deadlineSeconds": 180,
  "pollSeconds": 2,
  "maxBacklogAgeSeconds": 300,
  "relay": {
    "topic": "projects/PROJECT/topics/NATIVE",
    "subscription": "projects/PROJECT/subscriptions/RELAY",
    "deadLetterTopic": "projects/PROJECT/topics/RELAY-DEAD",
    "deadLetterSubscription": "projects/PROJECT/subscriptions/RELAY-DEAD",
    "publisherServiceAccount": "service-123@gs-project-accounts.iam.gserviceaccount.com",
    "subscriberServiceAccount": "RELAY@PROJECT.iam.gserviceaccount.com",
    "pubsubServiceAgent": "service-123@gcp-sa-pubsub.iam.gserviceaccount.com",
    "maxDeliveryAttempts": 10,
    "minRetentionSeconds": 604800,
    "minDeadLetterRetentionSeconds": 1209600
  },
  "worker": {
    "topic": "projects/PROJECT/topics/KEYED",
    "subscription": "projects/PROJECT/subscriptions/IMPORTER",
    "deadLetterTopic": "projects/PROJECT/topics/IMPORTER-DEAD",
    "deadLetterSubscription": "projects/PROJECT/subscriptions/IMPORTER-DEAD",
    "publisherServiceAccount": "RELAY@PROJECT.iam.gserviceaccount.com",
    "subscriberServiceAccount": "IMPORTER@PROJECT.iam.gserviceaccount.com",
    "pubsubServiceAgent": "service-123@gcp-sa-pubsub.iam.gserviceaccount.com"
  },
  "binding": {
    "workspaceId": "TEST_WORKSPACE",
    "bucket": "PRIVATE_UPLOADS_BUCKET",
    "prefix": "files/w/TEST_WORKSPACE/",
    "tenant": "TEST_TENANT",
    "directoryId": "0190c3a0b1c27d4e8f0a1b2c3d4e5f60",
    "endpoint": "https://DFS_GRPC_HOST:9841",
    "notificationConfigs": ["projects/_/buckets/PRIVATE_UPLOADS_BUCKET/notificationConfigs/1"],
    "allowedReaderTokenFile": "/etc/gcs-dfs/canary-tokens/allowed",
    "deniedReaderTokenFile": "/etc/gcs-dfs/canary-tokens/denied"
  }
}
```

The hop defaults are 10 maximum delivery attempts, seven days of source retention and fourteen days of DLQ retention. Both subscriptions and both DLQs must retain acknowledged messages and have no expiration TTL. The native subscription must be unordered and the importer subscription ordered. Missing metrics and samples older than ten minutes are unhealthy, including newly provisioned queues whose metrics have not appeared yet.

## Credentials, IAM and network

Use a dedicated canary Kubernetes/Google identity and a dedicated ExternalSecret for two **reader session keys**. Both must be current, 64-character session keys for the same DFS tenant. Include only the allowed session's intended subjects in the trusted reader grants; exclude denied-session subjects from every effective read grant. Tenant-management keys are not valid reader credentials. The checker has no importer credential or direct FDB access.

The checker reuses `front/lib/dfs` and `dfs/protocol/proto/dfs.proto`. Each call carries its session key as bearer metadata. It verifies both readers with `CurrentSession` before producer allocation, resolves the object hash through `Lookup` under the configured real `directoryId`, and calls `Read` for at most 64 KiB. The hash is SHA-256 of the UTF-8 JSON array `[bucket, objectName]`. This matches the importer’s final directory. The canary does not receive staging-directory authority.

The bytes and size comparison uses the same `Read` response, rather than a version precondition absent from the protocol. Only `forbidden` with a still-valid same-tenant session counts as denial; `not_found` means absence. `unauthenticated`, unsupported RPCs and invalid responses fail the run. The canary closes its channel but does not revoke externally managed reader sessions. The protocol has no administrator flag, Login, Logout, Root or CheckSession RPC. Provisioning must manage session expiry and renewal.

The canary identity needs normal front DB connectivity and source create/get/delete permissions scoped to its test workspace's `files/w/<workspaceId>/` objects. Set `DUST_PRIVATE_UPLOADS_BUCKET` to the enrolled private bucket; mismatches fail before allocation. Retain normal `DUST_UPLOAD_BUCKET` configuration and allow deletion under the same test prefix there: normal `FileResource.delete` also attempts deletion of the public variant with `ignoreNotFound`. The canary does not publish public content. Use ADC consistently; do not accidentally inherit a `SERVICE_ACCOUNT` keyfile that changes the producer's identity.

Add these read-only cloud permissions to the canary identity, never to relay/importer:

| Permission | Scope and purpose |
| --- | --- |
| `storage.buckets.get` | Enrolled private bucket; read each installed notification configuration |
| `storage.objects.get` | Test workspace objects; confirm authoritative source absence after delete |
| `pubsub.subscriptions.get` | Both delivery subscriptions and both retained DLQ subscriptions |
| `pubsub.topics.getIamPolicy` | Native, keyed and both DLQ topics |
| `pubsub.subscriptions.getIamPolicy` | Both delivery subscriptions |
| `monitoring.timeSeries.list` | Queue projects; read backlog age and DLQ count |

Notification reads require `storage.buckets.get`, not bucket IAM-management access. [GCS notification API](https://docs.cloud.google.com/storage/docs/json_api/v1/notifications/get)

IAM drift checks expect direct unconditional `roles/pubsub.publisher` and `roles/pubsub.subscriber` bindings on the configured resources, matching the Terraform module. They check GCS-to-native publishing, relay-to-keyed publishing, both worker subscribers, and each Pub/Sub service agent's DLQ publisher and source-subscriber grants. Inherited/custom/conditional roles do not satisfy this structural check. The service agent needs both forwarding permissions. [Pub/Sub dead-letter permissions](https://docs.cloud.google.com/pubsub/docs/dead-letter-topics#granting_forwarding_permissions)

Allow DNS, ADC metadata, the regional Pub/Sub endpoint, `storage.googleapis.com`, `monitoring.googleapis.com`, the configured DFS TLS endpoint, front database dependencies and DogStatsD egress. The canary never pulls or acknowledges messages, publishes synthetic events, changes IAM, or calls importer mutation APIs. Private-VIP DNS/API policy must include Cloud Monitoring as well as Storage and Pub/Sub.

The producer's application dependency audit follows `Authenticator.internalAdminForWorkspace` and the unattached `text/plain` FileResource lifecycle:

| Environment or transport | Requirement |
| --- | --- |
| `FRONT_DATABASE_URI` | Required at module initialization and for workspace, subscription, group/permission and file-record queries and writes; allow its actual PostgreSQL/PgBouncer destination and port |
| `REDIS_CACHE_URI` | Used by workspace/authentication resource caches, including subscription and kill-switch reads; allow this cache destination even when it differs from `REDIS_URI` |
| `FRONT_DATABASE_READ_REPLICA_URI`, `REDIS_URI` | Preserve normal front configuration; these are distinct settings, not aliases for the primary database and Redis cache |
| `DUST_PRIVATE_UPLOADS_BUCKET`, `DUST_UPLOAD_BUCKET` | Enrolled private bucket and normal public-variant cleanup bucket, respectively |
| `SERVICE_ACCOUNT`, `GOOGLE_APPLICATION_CREDENTIALS` | Unset before Node starts so neither the storage wrapper nor Google Auth selects an inherited credential file |
| `DD_AGENT_HOST`, `DD_DOGSTATSD_PORT` | Used directly by the existing metrics client; allow UDP 8125 to the configured agent |
| Datadog trace agent | The command preloads `dd-trace/init`; retain agent TCP 8126 egress when tracing is enabled, alongside DogStatsD |

For this exact unattached text-file path, mount resolution, Core artifact cleanup, frame sharing and sandbox cleanup are skipped. Authentication's optional BYOK health lookup reads stored database/cache health, not provider APIs. No additional Core, Temporal, sandbox, OAuth, LLM, Elasticsearch or front HTTP API call was found on the exercised path. This is a source audit; the complete container startup and live job remain unverified. Adding conversation metadata, frame content or file processing would require a new dependency review.

## Evidence and telemetry

The producer allocates a unique FileResource and writes a fresh nonce. The checker waits for exact bytes through the allowed reader, then requires denial to the other valid reader. It repeats this sequence after overwriting the same object with a different nonce. After normal deletion, it requires both DFS namespace absence and authoritative live-GCS absence. Each convergence phase defaults to 180 seconds. Cleanup is attempted even after failure. Allocation IDs are logged for operator recovery; source payloads and tokens are not logged. Interrupted or ambiguous operations may leave artifacts; there is no cleanup inventory scan.

The checker independently inspects notification event/prefix coverage, both queue links, ordering, retention, expiration, DLQ forwarding configuration, direct IAM bindings, backlog freshness/age and both DLQ backlogs. These checks do not demonstrate that DLQ forwarding works under a poison-message failure, nor detect missing events for arbitrary non-canary objects.

The existing `gcs_dfs.operations`, `gcs_dfs.duration_ms` and `gcs_dfs.bytes` metrics add these components/operations:

| Component | Operations | Outcomes |
| --- | --- | --- |
| `producer` | `create`, `update`, `delete` | `success`, `error` |
| `checker` | `canary_run`, `canary_create`, `canary_update`, `canary_delete`, `canary_cleanup` | `success`, `error` |
| `checker` | `notification_drift`, `subscription_drift`, `iam_drift`, `backlog`, `dead_letters` | `success`, `error` |

Tags retain `environment`, `cell`, `component`, `operation`, `outcome`, `error_class`. Per-hop drift checks additionally use `hop:relay` or `hop:importer`. Failure classes distinguish `content_mismatch`, `convergence_timeout`, `delete_not_converged`, `allowed_reader_denied`, `reader_not_denied`, structural `check_failed`, and transport/configuration failures. A complete successful run emits hostless gauge `gcs_dfs.canary.last_success_unixtime` with environment/cell/component tags. Use its timestamp or successful `operation:canary_run` counts to alert on missing successful runs; account for schedule and job deadline. Monitor failed Job status too, since invalid startup configuration can prevent any metrics.

Producer metrics here measure the canary's application writes. They do not instrument every production front upload. A source success is not a replica success; use the corresponding checker phase to measure convergence. Do not sum producer, importer, checker phase and whole-run counters together. Metric delivery is best effort.

## Validation boundary

Focused Node tests cover byte mismatches, reader denial, failed/ambiguous writes, stale deletion, cleanup, cancellation, strict configuration and drift failures. The old PoC Rust gRPC tests are historical evidence for a different protocol and do not validate this server. A complete run against front DB, native GCS, ordered Pub/Sub and DFS is still a rollout gate. The old direct-delivery million-operation experiment does not cover this canary or the relay.
