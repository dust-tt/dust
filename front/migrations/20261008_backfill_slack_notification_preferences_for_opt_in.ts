/*
import { getNovuClient } from "@app/lib/notifications";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  concurrentExecutor,
  setTimeoutAsync,
} from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { CONVERSATION_UNREAD_TRIGGER_ID } from "@app/types/notification_preferences";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { NovuError } from "@novu/api/models/errors";

const FEATURE_FLAG_NAME: WhitelistableFeature =
  "conversations_slack_notifications";
// Novu's maximum page size for list endpoints.
const PAGE_SIZE = 100;

// Slack notifications for unread conversations (the `chat` step of the conversation-unread
// workflow) were rolled out behind the `conversations_slack_notifications` flag, opt-out. We are
// removing the flag and making them opt-in, without changing what anyone receives today.
//
// How Novu preferences work (https://docs.novu.co/platform/concepts/preferences):
// - A workflow declares a default per channel (`preferences` in the workflow code). Ours declared
//   none, so `chat` defaulted to enabled.
// - A subscriber can store their own value per workflow and channel. The most specific layer
//   wins: a stored subscriber value always beats the workflow default.
// - Changing the workflow default does not touch stored subscriber values.
// - The preferences API only returns the resolved value. We can't tell whether a subscriber chose
//   `chat: true` or is just inheriting the default.
//
// The plan is to flip the workflow default to `chat: false`. Anyone who only inherits `true` today
// would silently flip with it, so this script first stores an explicit value for every subscriber:
// - Users in a flagged workspace (active membership): they receive Slack today, so we store
//   `chat: true`, unless their resolved value is already `false` (they opted out).
// - Everyone else: we store `chat: false`. The flag blocked Slack for them, but many have a stored
//   `chat: true` anyway: the settings form saves every channel, chat included, even when the
//   Slack toggle is hidden. Without this, removing the flag would start sending them Slack.
// Subscribers who don't exist in Novu yet inherit the new default once it is off.
// Run this while the workflow default is still enabled, then flip the default, then remove the flag.
makeScript(
  {
    requestsPerSecond: {
      type: "number",
      // The Team plan allows 200 req/s on subscriber endpoints, shared with production traffic.
      // The Novu SDK retries 429s on its own (honoring Retry-After).
      default: 30,
      describe: "Maximum Novu requests started per second",
    },
    after: {
      type: "string",
      describe:
        "Resume from this subscribers cursor (the `nextCursor` of the last completed page)",
    },
  },
  async ({ execute, requestsPerSecond, after: startAfter }, logger) => {
    const flagCount =
      await FeatureFlagResource.countForAllWorkspaces(FEATURE_FLAG_NAME);
    const flags =
      await FeatureFlagResource.dangerouslyListForAllWorkspacesByName(
        FEATURE_FLAG_NAME,
        { limit: flagCount }
      );
    const workspaces = await WorkspaceResource.fetchByModelIds(
      flags.map((flag) => flag.workspaceId)
    );

    const rolloutUserIds = new Set<string>();
    for (const workspace of workspaces) {
      const { memberships } = await MembershipResource.getActiveMemberships({
        workspace: renderLightWorkspaceType({ workspace }),
      });
      for (const membership of memberships) {
        if (membership.user) {
          rolloutUserIds.add(membership.user.sId);
        }
      }
    }
    logger.info(
      {
        workspaceCount: workspaces.length,
        rolloutUserCount: rolloutUserIds.size,
      },
      "Computed rollout users."
    );

    const novu = await getNovuClient();

    // Spaces request starts evenly.
    let nextSlotAt = 0;
    const waitForSlot = async () => {
      const now = Date.now();
      const slotAt = Math.max(now, nextSlotAt);
      nextSlotAt = slotAt + 1000 / requestsPerSecond;
      await setTimeoutAsync(slotAt - now);
    };

    const setChat = async (subscriberId: string, enabled: boolean) => {
      if (execute) {
        await waitForSlot();
        await novu.subscribers.preferences.update(
          {
            workflowId: CONVERSATION_UNREAD_TRIGGER_ID,
            channels: { chat: enabled },
          },
          subscriberId
        );
      }
    };

    const counts = {
      subscribers: 0,
      enabled: 0,
      disabled: 0,
      keptOptOut: 0,
      missingWorkflow: 0,
      notFound: 0,
    };

    const processSubscriber = async (subscriberId: string) => {
      if (!rolloutUserIds.has(subscriberId)) {
        await setChat(subscriberId, false);
        counts.disabled++;
        return;
      }

      await waitForSlot();
      const { result } = await novu.subscribers.preferences.list({
        subscriberId,
      });
      const workflowPreference = result.workflows.find(
        (w) => w.workflow.identifier === CONVERSATION_UNREAD_TRIGGER_ID
      );
      if (!workflowPreference) {
        counts.missingWorkflow++;
        return;
      }
      if (!workflowPreference.channels.chat) {
        counts.keptOptOut++;
        return;
      }
      await setChat(subscriberId, true);
      counts.enabled++;
    };

    let after: string | undefined = startAfter;
    do {
      await waitForSlot();
      const { result } = await novu.subscribers.search({
        limit: PAGE_SIZE,
        after,
        orderBy: "_id",
        orderDirection: "ASC",
      });

      await concurrentExecutor(
        result.data,
        async ({ subscriberId }) => {
          try {
            await processSubscriber(subscriberId);
          } catch (error) {
            // Subscriber deleted between the search and the update.
            if (error instanceof NovuError && error.statusCode === 404) {
              counts.notFound++;
              return;
            }
            throw error;
          }
        },
        // Only bounds in-flight requests; waitForSlot sets the rate.
        { concurrency: requestsPerSecond }
      );

      counts.subscribers += result.data.length;
      // Logged once the whole page is done: resuming with `--after <nextCursor>` redoes nothing
      // but an interrupted page, which is safe since every write is idempotent.
      logger.info(
        { ...counts, nextCursor: result.next },
        "Processed subscribers page."
      );
      after = result.next ?? undefined;
    } while (after);

    logger.info(
      { ...counts },
      execute
        ? "Pinned Slack notification preferences."
        : "Dry run: would have pinned Slack notification preferences."
    );
  }
);
*/
