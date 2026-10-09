import { CanaryConfigSchema } from "@app/workers/gcs_dfs/canary";

export function canaryConfig() {
  const hop = (name: string) => ({
    topic: `projects/test/topics/${name}`,
    subscription: `projects/test/subscriptions/${name}`,
    deadLetterTopic: `projects/test/topics/${name}-dead`,
    deadLetterSubscription: `projects/test/subscriptions/${name}-dead`,
    publisherServiceAccount: `${name}@test.iam.gserviceaccount.com`,
    subscriberServiceAccount: `${name}@test.iam.gserviceaccount.com`,
    pubsubServiceAgent: "service-123@gcp-sa-pubsub.iam.gserviceaccount.com",
  });
  return CanaryConfigSchema.parse({
    pubsubEndpoint: "https://europe-west1-pubsub.googleapis.com",
    relay: hop("relay"),
    worker: hop("worker"),
    binding: {
      workspaceId: "workspace",
      bucket: "private",
      prefix: "files/w/workspace/",
      tenant: "tenant",
      directoryId: "0190c3a0b1c27d4e8f0a1b2c3d4e5f60",
      endpoint: "http://127.0.0.1:7544",
      allowedReaderTokenFile: "/allowed",
      deniedReaderTokenFile: "/denied",
      notificationConfigs: ["projects/_/buckets/private/notificationConfigs/1"],
    },
  });
}
