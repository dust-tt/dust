import { listDiscoveryForYouItems } from "@app/lib/api/discovery";
import { createPlugin } from "@app/lib/api/poke/types";
import { Authenticator } from "@app/lib/auth";
import { fetchDiscoveryForYouCandidates } from "@app/lib/search_usage/for_you";
import type { DiscoveryRankedItemType } from "@app/types/api/discovery";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

function pokeItemPath(item: DiscoveryRankedItemType): string {
  switch (item.type) {
    case "agent":
      return `assistants/${item.target.sId}`;
    case "skill":
      return `skills/${item.target.sId}`;
    default:
      return assertNever(item);
  }
}

export const discoveryForYouPlugin = createPlugin({
  manifest: {
    id: "discovery-for-you",
    name: "Discovery For You",
    description:
      "Show the For You recommendations of a member's discovery homepage.",
    resourceTypes: ["workspaces"],
    args: {
      userId: {
        type: "enum",
        label: "User",
        description: "Search by name or email.",
        values: [{ label: "Select a member", value: "", checked: true }],
        multiple: false,
        serverSideSearch: true,
      },
    },
  },
  execute: async (auth, _resource, args) => {
    const userId = args.userId[0];
    if (!userId) {
      return new Err(new Error("Select a member."));
    }

    const workspace = auth.getNonNullableWorkspace();
    const targetAuth = await Authenticator.fromUserIdAndWorkspaceId(
      userId,
      workspace.sId
    );
    if (!targetAuth.isUser()) {
      return new Err(new Error("User is not a member of this workspace."));
    }

    const itemsResult = await listDiscoveryForYouItems(targetAuth);
    if (itemsResult.isErr()) {
      return itemsResult;
    }
    const candidatesResult = await fetchDiscoveryForYouCandidates(targetAuth);
    if (candidatesResult.isErr()) {
      return candidatesResult;
    }
    if (itemsResult.value === null || candidatesResult.value === null) {
      return new Ok({
        display: "text",
        value: "Recommendations are being computed, retry in a few seconds.",
      });
    }
    if (itemsResult.value.length === 0) {
      return new Ok({ display: "text", value: "No recommendations." });
    }

    const candidatesByKey = new Map(
      candidatesResult.value.map((c) => [
        `${c.resourceType}:${c.resourceId}`,
        c,
      ])
    );
    const rows = itemsResult.value.map((item, index) => {
      const candidate = candidatesByKey.get(`${item.type}:${item.target.sId}`);
      const stats = candidate
        ? `${candidate.score.toPrecision(3)} | ${candidate.users} / ${candidate.groupActiveUsers} | [${candidate.reasonGroupId}](/poke/${workspace.sId}/groups/${candidate.reasonGroupId})`
        : "— | — | —";
      return `| ${index + 1} | ${item.type} | [${item.target.name}](/poke/${workspace.sId}/${pokeItemPath(item)}) | ${stats} |`;
    });

    return new Ok({
      display: "markdown",
      value: [
        "| # | Type | Name | Score | Group users | Reason group |",
        "|---|---|---|---|---|---|",
        ...rows,
      ].join("\n"),
    });
  },
});
