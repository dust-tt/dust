import { createPlugin } from "@app/lib/api/poke/types";
import { ActivationRecommendationResource } from "@app/lib/resources/activation_recommendation_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;
const CONTENT_PREVIEW_LENGTH = 120;

function escapeCell(value: string): string {
  // Keep the value on one table row and inside one cell.
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export const activationRecommendationHistoryPlugin = createPlugin({
  manifest: {
    id: "activation-recommendation-history",
    name: "Activation Recommendation History",
    description:
      "List the most recent activation recommendations shown to users across " +
      "this workspace.",
    resourceTypes: ["workspaces"],
    readonly: true,
    args: {
      limit: {
        type: "number",
        label: "How many to show",
        description: `Most recent recommendations to list (max ${MAX_HISTORY_LIMIT}).`,
        default: DEFAULT_HISTORY_LIMIT,
      },
    },
    requiredRoles: ["support"],
  },
  execute: async (auth, _resource, { limit }) => {
    const effectiveLimit = Math.min(
      Math.max(1, limit || DEFAULT_HISTORY_LIMIT),
      MAX_HISTORY_LIMIT
    );

    const recommendations =
      await ActivationRecommendationResource.listByWorkspace(auth, {
        limit: effectiveLimit,
      });

    if (recommendations.length === 0) {
      return new Ok({
        display: "markdown",
        value: "No activation recommendations recorded for this workspace yet.",
      });
    }

    const workspaceId = auth.getNonNullableWorkspace().sId;

    const users = await UserResource.fetchByModelIds([
      ...new Set(recommendations.map((rec) => rec.userId)),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));

    const conversationModelIds = removeNulls(
      recommendations.map((rec) => rec.conversationId)
    );
    const conversations = conversationModelIds.length
      ? await ConversationResource.fetchByModelIds(auth, conversationModelIds)
      : [];
    const conversationSIdById = new Map(
      conversations.map((conversation) => [conversation.id, conversation.sId])
    );

    const header = [
      "| When | User | Recommendation | Status | Conversation |",
      "| --- | --- | --- | --- | --- |",
    ];
    const rows = recommendations.map((rec) => {
      const user = userById.get(rec.userId);
      const conversationSId =
        rec.conversationId !== null
          ? conversationSIdById.get(rec.conversationId)
          : undefined;
      const conversationLink = conversationSId
        ? `[open](/poke/${workspaceId}/conversation/${conversationSId})`
        : "—";
      const userLabel = user?.fullName() || user?.email || "unknown";
      const recommendation = `**${escapeCell(rec.title)}** — ${escapeCell(
        truncate(rec.content, CONTENT_PREVIEW_LENGTH)
      )}`;
      return (
        `| ${rec.createdAt.toISOString()} ` +
        `| ${escapeCell(userLabel)} ` +
        `| ${recommendation} ` +
        `| ${rec.status} ` +
        `| ${conversationLink} |`
      );
    });

    return new Ok({
      display: "markdown",
      value: [
        `Showing ${recommendations.length} most recent recommendation(s):`,
        "",
        ...header,
        ...rows,
      ].join("\n"),
    });
  },
  isApplicableTo: () => true,
});
