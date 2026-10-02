import {
  issueExample,
  issueSchema,
} from "@app/lib/api/triggers/built-in-webhooks/github/schemas/issues";
import {
  projectsV2ItemExample,
  projectsV2ItemSchema,
} from "@app/lib/api/triggers/built-in-webhooks/github/schemas/projects_v2_item";
import {
  pullRequestExample,
  pullRequestSchema,
} from "@app/lib/api/triggers/built-in-webhooks/github/schemas/pull_request";
import {
  prReviewExample,
  prReviewSchema,
} from "@app/lib/api/triggers/built-in-webhooks/github/schemas/pull_request_review";
import {
  pushExample,
  pushSchema,
} from "@app/lib/api/triggers/built-in-webhooks/github/schemas/push";
import {
  releaseExample,
  releaseSchema,
} from "@app/lib/api/triggers/built-in-webhooks/github/schemas/release";
import { GITHUB_WEBHOOK_METADATA } from "@app/lib/triggers/built-in-webhooks/github/preset";
import type {
  BaseWebhookPreset,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

const eventPayloads = {
  pull_request: { schema: pullRequestSchema, sample: pullRequestExample },
  issues: { schema: issueSchema, sample: issueExample },
  pull_request_review: { schema: prReviewSchema, sample: prReviewExample },
  push: { schema: pushSchema, sample: pushExample },
  projects_v2_item: {
    schema: projectsV2ItemSchema,
    sample: projectsV2ItemExample,
  },
  release: { schema: releaseSchema, sample: releaseExample },
} satisfies Record<
  (typeof GITHUB_WEBHOOK_METADATA.events)[number]["value"],
  Pick<WebhookEvent, "schema" | "sample">
>;

export const GITHUB_WEBHOOK_PRESET: BaseWebhookPreset = {
  ...GITHUB_WEBHOOK_METADATA,
  events: GITHUB_WEBHOOK_METADATA.events.map((event) => ({
    ...event,
    ...eventPayloads[event.value],
  })),
  filterGenerationInstructions: null,
};
