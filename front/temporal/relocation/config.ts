import type { RegionType } from "@app/lib/api/regions/config";

const QUEUE_VERSION = 2;

export const RELOCATION_QUEUES_PER_REGION: Record<RegionType, string> = {
  "europe-west1": `relocation-queue-eu-v${QUEUE_VERSION}`,
  "us-central1": `relocation-queue-us-v${QUEUE_VERSION}`,
};
