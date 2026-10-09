import { observeCheck } from "@app/workers/gcs_dfs/canary";
import type { CanaryCheck, CanaryConfig } from "@app/workers/gcs_dfs/canary";
import type { GoogleHealthTransport } from "@app/workers/gcs_dfs/health_transport";
import type { Observer } from "@app/workers/gcs_dfs/telemetry";

type DriftTransport = Pick<
  GoogleHealthTransport,
  "notification" | "roleGranted" | "subscription" | "metric"
>;

export async function checkDrift(
  config: CanaryConfig,
  transport: DriftTransport,
  observer: Observer
): Promise<CanaryCheck[]> {
  const checks = [
    await observeCheck(
      "notification_drift",
      async () => {
        for (const id of config.binding.notificationConfigs) {
          const notification = await transport.notification(
            config.binding.bucket,
            id
          );
          if (
            notification.topic !==
              `//pubsub.googleapis.com/${config.relay.topic}` ||
            notification.payload_format !== "JSON_API_V1" ||
            !config.binding.prefix.startsWith(
              notification.object_name_prefix ?? ""
            ) ||
            (notification.event_types?.length &&
              ![
                "OBJECT_FINALIZE",
                "OBJECT_METADATA_UPDATE",
                "OBJECT_ARCHIVE",
                "OBJECT_DELETE",
              ].every((event) => notification.event_types?.includes(event)))
          ) {
            return false;
          }
        }
        return true;
      },
      observer
    ),
  ];
  for (const [component, hop] of [
    ["relay", config.relay],
    ["importer", config.worker],
  ] as const) {
    const hopObserver: Observer = (event) =>
      observer({ ...event, hop: component });
    const runHopCheck = async (
      operation: CanaryCheck["operation"],
      run: () => Promise<boolean>
    ): Promise<CanaryCheck> => ({
      ...(await observeCheck(operation, run, hopObserver)),
      hop: component,
    });
    checks.push(
      await runHopCheck("subscription_drift", async () => {
        const [subscription, dead] = await Promise.all([
          transport.subscription(hop.subscription),
          transport.subscription(hop.deadLetterSubscription),
        ]);
        const retained = (value: typeof subscription, seconds: number) =>
          /^[0-9]+s$/.test(value.messageRetentionDuration ?? "") &&
          Number(value.messageRetentionDuration?.slice(0, -1)) >= seconds &&
          value.retainAckedMessages === true &&
          value.expirationPolicy !== undefined &&
          !value.expirationPolicy.ttl;
        return (
          subscription.topic === hop.topic &&
          subscription.deadLetterPolicy?.deadLetterTopic ===
            hop.deadLetterTopic &&
          subscription.deadLetterPolicy.maxDeliveryAttempts ===
            hop.maxDeliveryAttempts &&
          (subscription.enableMessageOrdering ?? false) ===
            (component === "importer") &&
          dead.topic === hop.deadLetterTopic &&
          !dead.deadLetterPolicy &&
          retained(subscription, hop.minRetentionSeconds) &&
          retained(dead, hop.minDeadLetterRetentionSeconds)
        );
      })
    );
    checks.push(
      await runHopCheck("iam_drift", async () => {
        for (const [resource, role, member] of [
          [hop.topic, "roles/pubsub.publisher", hop.publisherServiceAccount],
          [
            hop.subscription,
            "roles/pubsub.subscriber",
            hop.subscriberServiceAccount,
          ],
          [
            hop.deadLetterTopic,
            "roles/pubsub.publisher",
            hop.pubsubServiceAgent,
          ],
          [hop.subscription, "roles/pubsub.subscriber", hop.pubsubServiceAgent],
        ]) {
          if (!(await transport.roleGranted(resource, role, member))) {
            return false;
          }
        }
        return true;
      })
    );
    for (const operation of ["backlog", "dead_letters"] as const) {
      checks.push(
        await runHopCheck(operation, async () => {
          const sample = await transport.metric(
            operation === "backlog"
              ? hop.subscription
              : hop.deadLetterSubscription,
            operation === "backlog"
              ? "oldest_unacked_message_age"
              : "num_undelivered_messages"
          );
          return (
            sample !== null &&
            sample.sampledAtMs <= Date.now() &&
            Date.now() - sample.sampledAtMs <= 600_000 &&
            sample.value <=
              (operation === "backlog" ? config.maxBacklogAgeSeconds : 0)
          );
        })
      );
    }
  }
  return checks;
}
