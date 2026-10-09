# GCS replication canaries and health checks

This operator tool describes the earlier direct-delivery prototype. It is not a process health endpoint or the production two-hop canary. Do not deploy it unchanged for the keyed relay topology. See [Deployment contract](DEPLOYMENT_CONTRACT.md) for current probes, and [Canary contract](CANARY_CONTRACT.md) for the implemented two-hop checker.


The standalone health probe verifies the notification-driven GCS to DFS path without running periodic inventory reconciliation. It writes a fresh canary generation into each explicitly selected binding and waits for that exact generation and metageneration to appear as live in DFS's committed source cursor. The probe cannot stage or publish DFS content and never synthesizes notification messages: only the ordinary worker imports the canary.

The existing importer commits the cursor, content manifest, namespace and grants atomically. Observing the canary cursor therefore verifies durable import completion. This probe does not independently read file bytes through the end-user API or test permission revocation. It tests finalize/overwrite delivery; delete and metadata-event coverage still need native integration tests. It also cannot detect isolated missing events for other objects. That limitation is accepted for the current scope.

## Running the probe

Build from the repository root:

```sh
npm -w front run build:gcs-dfs-health
npm -w front run check:gcs-dfs-health -- /run/config/gcs-worker.json /run/config/gcs-health.json
```

The first argument is the worker configuration described in [GCS replication design](GCS_SYNC.md). The second is a separate health configuration:

```json
{
  "topic": "projects/example/topics/gcs-events",
  "deadLetterSubscription": "projects/example/subscriptions/gcs-dfs-dead",
  "deadlineSeconds": 180,
  "pollSeconds": 2,
  "maxBacklogAgeSeconds": 300,
  "targets": [
    {
      "bindingIndex": 0,
      "publisherServiceAccount": "service-123456789@gs-project-accounts.iam.gserviceaccount.com"
    }
  ]
}
```

Reserve `<binding.prefix>.dust-gcs-dfs-canary` exclusively for the probe before enabling it. The probe overwrites this fixed object with a small random nonce, using a generation precondition based on its preceding metadata read. An initial write uses `ifGenerationMatch=0`. Concurrent changes fail safely instead of overwriting an unobserved generation. Each run requires a fresh generation; an old DFS cursor cannot pass the check. Only explicitly selected bindings are covered. Use operator-only reader mappings for canary bindings.

Run one scheduled probe per configuration, with overlapping runs forbidden. Start with a five-minute schedule for up to four targets and a three-minute canary deadline. Targets execute with concurrency four; larger target lists require a longer schedule and heartbeat threshold. Each remote request uses the worker's request timeout, so an in-flight request may finish after the canary deadline, but cannot turn a late observation into success. Deployment scheduling and alert resources belong in dust-infra and are not created by this command.

The CLI refuses worker configurations containing `pubsubEmulatorHost`, before any source write. Local tests substitute external adapters explicitly; a mixed emulator/real-GCS probe must not be mistaken for cloud validation.

## Identity and privileges

Use a dedicated probe identity, separate from the replication worker. The worker remains read-only on source objects. Grant the probe object get/create/delete on the reserved canary objects only: replacing a live GCS object requires delete permission as well as create. The probe does not call the object delete API. Use source lifecycle policies appropriate for canaries if versioning retains old generations; the prototype's immutable DFS staging also has no garbage collector.

The probe additionally needs `storage.buckets.get` for notification configuration reads, `pubsub.topics.getIamPolicy` on the source topic, `pubsub.subscriptions.get` on source and dead-letter subscriptions, and `monitoring.timeSeries.list` in the subscription projects. It needs access to the selected bindings' DFS importer credential files to read source cursors. The current cursor API uses importer authentication, so deploy the probe as a trusted operator workload; a separate read-only DFS probe credential is future work. Do not grant the probe IAM-management permissions.

The topic-policy check verifies the expected direct, unconditional `roles/pubsub.publisher` binding for the configured GCS service account. It does not evaluate inherited/custom roles, conditional grants, deny policies, or every worker permission. Deployments relying on inherited or conditional grants will report grant drift even if effective publishing works. The end-to-end canary provides an operational check of publisher access and the worker's consume/read/import path. A 403 while inspecting policy is reported as unavailable, never silently skipped; the previously used dev identity cannot pass that check without additional read access.

## Checks and alert signals

Each result is a structured application log with `check`, `target` (binding index; zero for subscription-wide checks), `healthy`, `reason`, and optional `value` or `durationMs`. No object names, bodies, credentials, or raw remote errors are logged. The command exits zero only when every check passes, and one otherwise. Every completed run emits `GCS DFS health probe completed` with `completedAtMs` and aggregate `healthy`.

| Check | Failure signal |
| --- | --- |
| `canary` | Upload/read failure, identity mismatch, or failure to observe the fresh live cursor before the deadline |
| `notification` | Missing configuration, wrong topic, wrong payload format, narrower prefix, or missing required event types |
| `publisher_iam` | Missing expected direct publisher grant or inability to inspect policy |
| `subscription` | Wrong source topic, missing dead-letter policy, or dead-letter subscription pointing to another topic |
| `backlog` | Oldest unacknowledged age exceeds the configured threshold |
| `dead_letters` | Retained dead-letter subscription contains any unacknowledged message |

All allowlisted notification configurations on each selected binding are checked against the full four-event capture design. Empty or omitted event filters mean all events. The probe never consumes or acknowledges dead-letter messages.

Cloud Monitoring data is delayed. The probe requests a fifteen-minute window and uses the latest sample; missing samples, samples older than ten minutes, future timestamps, malformed values, pagination beyond the bounded response, or read failures are unhealthy. An idle or newly created subscription without metrics therefore requires investigation or a deliberate deployment warm-up period, not an assumed zero backlog. The dead-letter check measures retained backlog, not an arrival counter; do not automatically drain that subscription. Operators who acknowledge dead letters between metric samples can remove evidence before this check observes it.

Configure alerts on any `GCS DFS health check failed` log, probe job failure, and absence of the completion heartbeat for two expected scheduling intervals plus maximum run duration. The heartbeat alert is required: a crashed or unscheduled probe cannot emit its own failure. Also alert on worker permission errors and acknowledgement lease failures using the existing worker logs. Alert delivery is external; this change emits the signals and exit status but does not install production monitors or send messages to on-call channels.

## Recovery and scope

On failure, inspect the specific check, notification configuration, relevant IAM grant, source/DFS availability and backlog. Repair configuration or permissions explicitly and rerun the probe. An empty backlog or a successful canary does not prove that every source object is replicated. Any backfill or repair of missed objects remains an explicit operator action. The probe never repairs policy, enrolls buckets, scans inventory or bypasses the worker by directly publishing content.

## References

- [GCS notification delivery guarantees](https://docs.cloud.google.com/storage/docs/pubsub-notifications#delivery_guarantees)
- [Conditional object uploads and required permissions](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/insert)
- [Reading notification configurations](https://docs.cloud.google.com/storage/docs/json_api/v1/notifications/get)
- [Pub/Sub monitoring metrics](https://docs.cloud.google.com/monitoring/api/metrics_gcp_p_z#pubsub)
- [Cloud Monitoring time-series reads](https://docs.cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.timeSeries/list)
