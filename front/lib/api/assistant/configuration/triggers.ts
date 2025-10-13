import { runActionStreamed } from "@app/lib/actions/server";
import type { Authenticator } from "@app/lib/auth";
import { getDustProdAction } from "@app/lib/registry";
import { cloneBaseConfig } from "@app/lib/registry";
import type { Result } from "@app/types";
import { Err, getSmallWhitelistedModel, Ok } from "@app/types";

function isValidIANATimezone(timezone: string): boolean {
  // Get the list of all supported IANA timezones
  const supportedTimezones = Intl.supportedValuesOf("timeZone");
  return supportedTimezones.includes(timezone);
}

function isTooFrequentCron(cron: string): boolean {
  return !cron.split(" ")[0].match(/^\d+$/);
}

export const GENERIC_ERROR_MESSAGE =
  "Unable to generate a schedule. Please try rephrasing.";
export const INVALID_TIMEZONE_MESSAGE =
  'Unable to generate the schedule, timezone returned by the model don\'t follow the IANA standard (i.e "Europe/Paris"). Please try rephrasing.';
export const TOO_FREQUENT_MESSAGE =
  "Unable to generate a schedule: it can't be more frequent than hourly. Please try rephrasing.";

export const WEBHOOK_FILTER_GENERIC_ERROR_MESSAGE =
  "Unable to generate a filter. Please try rephrasing.";

export async function generateCronRule(
  auth: Authenticator,
  {
    naturalDescription,
    defaultTimezone,
  }: {
    naturalDescription: string;
    defaultTimezone: string;
  }
): Promise<Result<{ cron: string; timezone: string }, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getSmallWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate cron rule")
    );
  }

  const config = cloneBaseConfig(
    getDustProdAction("assistant-builder-cron-timezone-generator").config
  );
  config.CREATE_CRON.provider_id = model.providerId;
  config.CREATE_CRON.model_id = model.modelId;
  config.CREATE_TZ.provider_id = model.providerId;
  config.CREATE_TZ.model_id = model.modelId;

  const res = await runActionStreamed(
    auth,
    "assistant-builder-cron-timezone-generator",
    config,
    [
      {
        naturalDescription,
        defaultTimezone,
      },
    ],
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
    }
  );

  if (res.isErr()) {
    return new Err(new Error(`Error generating cron rule: ${res.error}`));
  }

  const { eventStream } = res.value;
  let cronRule: string | null = null;
  let timezone: string | null = null;

  for await (const event of eventStream) {
    if (event.type === "error") {
      return new Err(
        new Error(`Error generating cron rule: ${event.content.message}`)
      );
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return new Err(new Error(`Error generating cron rule: ${e.error}`));
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        const v = e.value as any;
        if (v.cron) {
          cronRule = v.cron;
        }
        if (v.timezone) {
          timezone = v.timezone;
        }
      }
    }
  }

  if (
    !cronRule ||
    cronRule.split(" ").length !== 5 ||
    !cronRule.match(
      /^((((\d+,)+\d+|(\d+(\/|-|#)\d+)|\d+L?|\*(\/\d+)?|L(-\d+)?|\?|[A-Z]{3}(-[A-Z]{3})?) ?){5,7})|(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\d+(ns|us|µs|ms|s|m|h))+)$/
    )
  ) {
    return new Err(new Error(GENERIC_ERROR_MESSAGE));
  }
  if (isTooFrequentCron(cronRule)) {
    return new Err(new Error(TOO_FREQUENT_MESSAGE));
  }
  if (!timezone || !isValidIANATimezone(timezone)) {
    return new Err(new Error(INVALID_TIMEZONE_MESSAGE));
  }
  return new Ok({ cron: cronRule, timezone });
}

export async function generateWebhookFilter(
  auth: Authenticator,
  {
    naturalDescription,
    eventSchema,
  }: {
    naturalDescription: string;
    eventSchema?: Record<string, any>;
  }
): Promise<Result<{ filter: string }, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getSmallWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate filter")
    );
  }

  const config = cloneBaseConfig(
    getDustProdAction("assistant-builder-webhook-filter-generator").config
  );
  config.CREATE_FILTER.provider_id = model.providerId;
  config.CREATE_FILTER.model_id = model.modelId;

  const res = await runActionStreamed(
    auth,
    "assistant-builder-webhook-filter-generator",
    config,
    [
      {
        naturalDescription,
        expectedPayloadDescription: {
          $schema: "http://json-schema.org/draft-07/schema#",
          title: "GitHub Pull Request Webhook Event",
          description:
            "Activity related to pull requests. The type of activity is specified in the `action` property of the payload object.",
          type: "object",
          required: ["action", "number", "pull_request", "sender"],
          properties: {
            action: {
              type: "string",
              description: "The action that was performed on the pull request.",
              enum: [
                "assigned",
                "auto_merge_disabled",
                "auto_merge_enabled",
                "closed",
                "converted_to_draft",
                "dequeued",
                "edited",
                "enqueued",
                "labeled",
                "locked",
                "merged",
                "opened",
                "ready_for_review",
                "reopened",
                "review_request_removed",
                "review_requested",
                "synchronize",
                "unassigned",
                "unlabeled",
                "unlocked",
              ],
            },
            number: {
              type: "number",
              description: "The pull request number.",
            },
            pull_request: {
              type: "object",
              description: "The pull request itself.",
              properties: {
                html_url: {
                  type: "string",
                  description: "The GitHub web URL of the pull request.",
                },
                id: {
                  type: "number",
                  description: "The unique identifier of the pull request.",
                },
                number: {
                  type: "number",
                  description: "The pull request number.",
                },
                state: {
                  type: "string",
                  description: "The state of the pull request.",
                  enum: ["open", "closed"],
                },
                locked: {
                  type: "boolean",
                  description: "Whether the pull request is locked.",
                },
                title: {
                  type: "string",
                  description: "The title of the pull request.",
                },
                user: {
                  $ref: "#/definitions/User",
                  description: "The user who created the pull request.",
                },
                body: {
                  type: "string",
                  description: "The body content of the pull request.",
                },
                created_at: {
                  type: "string",
                  description:
                    "The timestamp when the pull request was created.",
                },
                updated_at: {
                  type: "string",
                  description:
                    "The timestamp when the pull request was last updated.",
                },
                merged_at: {
                  type: "string",
                  description:
                    "The timestamp when the pull request was merged.",
                },
                assignee: {
                  $ref: "#/definitions/User",
                  description: "The user assigned to the pull request.",
                },
                assignees: {
                  type: "array",
                  description: "The users assigned to the pull request.",
                  items: {
                    $ref: "#/definitions/User",
                  },
                },
                requested_reviewers: {
                  type: "array",
                  description:
                    "The users requested to review the pull request.",
                  items: {
                    $ref: "#/definitions/User",
                  },
                },
                labels: {
                  type: "array",
                  description: "The labels applied to the pull request.",
                  items: {
                    $ref: "#/definitions/Label",
                  },
                },
                milestone: {
                  $ref: "#/definitions/Milestone",
                  description:
                    "The milestone associated with the pull request.",
                },
                head: {
                  type: "object",
                  description: "The head branch of the pull request.",
                  properties: {
                    label: {
                      type: "string",
                      description: "The label of the head branch.",
                    },
                    ref: {
                      type: "string",
                      description: "The ref of the head branch.",
                    },
                  },
                },
                base: {
                  type: "object",
                  description: "The base branch of the pull request.",
                  properties: {
                    label: {
                      type: "string",
                      description: "The label of the base branch.",
                    },
                    ref: {
                      type: "string",
                      description: "The ref of the base branch.",
                    },
                  },
                },
                draft: {
                  type: "boolean",
                  description: "Whether the pull request is a draft.",
                },
                merged: {
                  type: "boolean",
                  description: "Whether the pull request has been merged.",
                },
                mergeable: {
                  type: "boolean",
                  description: "Whether the pull request is mergeable.",
                },
                comments: {
                  type: "number",
                  description: "The number of comments on the pull request.",
                },
                commits: {
                  type: "number",
                  description: "The number of commits in the pull request.",
                },
                additions: {
                  type: "number",
                  description: "The number of additions in the pull request.",
                },
                deletions: {
                  type: "number",
                  description: "The number of deletions in the pull request.",
                },
                changed_files: {
                  type: "number",
                  description:
                    "The number of changed files in the pull request.",
                },
              },
            },
            sender: {
              $ref: "#/definitions/User",
              description: "The user that triggered the event.",
            },
          },
          definitions: {
            User: {
              type: "object",
              description: "A GitHub user object.",
              properties: {
                login: {
                  type: "string",
                  description: "The username of the user.",
                },
                id: {
                  type: "number",
                  description: "The unique identifier of the user.",
                },
                html_url: {
                  type: "string",
                  description: "The GitHub profile URL of the user.",
                },
                type: {
                  type: "string",
                  description: "The type of the user account.",
                  enum: ["User", "Organization"],
                },
                site_admin: {
                  type: "boolean",
                  description:
                    "Whether the user is a GitHub site administrator.",
                },
              },
            },
            Label: {
              type: "object",
              description: "A GitHub label object.",
              properties: {
                id: {
                  type: "number",
                  description: "The unique identifier of the label.",
                },
                url: {
                  type: "string",
                  description: "The API URL of the label.",
                },
                name: {
                  type: "string",
                  description: "The name of the label.",
                },
              },
            },
            Milestone: {
              type: "object",
              description: "A GitHub milestone object.",
              properties: {
                html_url: {
                  type: "string",
                  description: "The GitHub web URL of the milestone.",
                },
                id: {
                  type: "number",
                  description: "The unique identifier of the milestone.",
                },
                number: {
                  type: "number",
                  description: "The milestone number.",
                },
                title: {
                  type: "string",
                  description: "The title of the milestone.",
                },
                description: {
                  type: "string",
                  description: "The description of the milestone.",
                },
                creator: {
                  $ref: "#/definitions/User",
                  description: "The user who created the milestone.",
                },
                open_issues: {
                  type: "number",
                  description: "The number of open issues in the milestone.",
                },
                closed_issues: {
                  type: "number",
                  description: "The number of closed issues in the milestone.",
                },
                state: {
                  type: "string",
                  description: "The state of the milestone.",
                  enum: ["open", "closed"],
                },
                created_at: {
                  type: "string",
                  description: "The timestamp when the milestone was created.",
                },
                updated_at: {
                  type: "string",
                  description:
                    "The timestamp when the milestone was last updated.",
                },
                due_on: {
                  type: "string",
                  description: "The due date for the milestone.",
                },
                closed_at: {
                  type: "string",
                  description: "The timestamp when the milestone was closed.",
                },
              },
            },
          },
        },
      },
    ],
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
    }
  );

  if (res.isErr()) {
    return new Err(new Error(`Error generating filter: ${res.error}`));
  }

  const { eventStream } = res.value;
  let filter: string | null = null;

  for await (const event of eventStream) {
    if (event.type === "error") {
      return new Err(
        new Error(`Error generating filter: ${event.content.message}`)
      );
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return new Err(new Error(`Error generating filter: ${e.error}`));
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        const v = e.value as any;
        if (v.filter) {
          filter = v.filter;
        }
      }
    }
  }

  if (!filter) {
    return new Err(new Error(WEBHOOK_FILTER_GENERIC_ERROR_MESSAGE));
  }

  return new Ok({ filter });
}
