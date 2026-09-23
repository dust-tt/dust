import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { PinnedDiscoveryItemInput } from "@app/lib/resources/discovery_item_resource";
import { DiscoveryItemResource } from "@app/lib/resources/discovery_item_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  compareDiscoveryTrendingCandidates,
  fetchDiscoveryTrendingCandidates,
} from "@app/lib/search_usage/trending";
import type {
  DeleteGroupDiscoveryPinResponseBody,
  DiscoveryTrendingItemType,
  GetFeaturedDiscoveryItemsResponseBody,
  GetGroupDiscoveryPinsResponseBody,
  PutGroupDiscoveryPinResponseBody,
} from "@app/types/api/discovery";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

export type DiscoveryPinError = DustError<
  "group_not_found" | "invalid_id" | "invalid_request_error" | "unauthorized"
>;

export async function listFeaturedDiscoveryItems(
  auth: Authenticator
): Promise<GetFeaturedDiscoveryItemsResponseBody> {
  const items = await DiscoveryItemResource.listPinnedForAuth(auth);
  return { items: items.map((item) => DiscoveryItemResource.toJSON(item)) };
}

export async function listGroupDiscoveryPins(
  auth: Authenticator,
  { groupId }: { groupId: string }
): Promise<Result<GetGroupDiscoveryPinsResponseBody, DiscoveryPinError>> {
  const groupResult = await GroupResource.fetchById(auth, groupId);
  if (groupResult.isErr()) {
    return groupResult;
  }

  const items = await DiscoveryItemResource.listPinnedForGroup(auth, {
    groupModelId: groupResult.value.id,
  });
  return new Ok({
    items: items.map((item) => DiscoveryItemResource.toJSON(item)),
  });
}

export async function setGroupDiscoveryPin(
  auth: Authenticator,
  {
    groupId,
    item,
  }: {
    groupId: string;
    item: PinnedDiscoveryItemInput;
  }
): Promise<Result<PutGroupDiscoveryPinResponseBody, DiscoveryPinError>> {
  const groupResult = await GroupResource.fetchById(auth, groupId);
  if (groupResult.isErr()) {
    return groupResult;
  }

  const result = await DiscoveryItemResource.setPinnedForGroup(auth, {
    groupModelId: groupResult.value.id,
    item,
  });
  if (result.isErr()) {
    return result;
  }

  return new Ok({ item: DiscoveryItemResource.toJSON(result.value) });
}

export async function removeGroupDiscoveryPin(
  auth: Authenticator,
  {
    groupId,
    position,
  }: {
    groupId: string;
    position: number;
  }
): Promise<Result<DeleteGroupDiscoveryPinResponseBody, DiscoveryPinError>> {
  const groupResult = await GroupResource.fetchById(auth, groupId);
  if (groupResult.isErr()) {
    return groupResult;
  }

  const result = await DiscoveryItemResource.removePinnedForGroup(auth, {
    groupModelId: groupResult.value.id,
    position,
  });
  if (result.isErr()) {
    return result;
  }

  return new Ok({ success: true });
}

const DISCOVERY_TRENDING_ITEM_LIMIT = 5;

/**
 * Resolves cached workspace-wide candidates against the current viewer before exposing IDs.
 * This keeps inaccessible, archived, or unavailable resources out of the API response.
 */
export async function listDiscoveryTrendingItems(
  auth: Authenticator
): Promise<Result<DiscoveryTrendingItemType[] | null, ElasticsearchError>> {
  const result = await fetchDiscoveryTrendingCandidates(auth);
  if (result.isErr()) {
    return result;
  }
  if (result.value === null) {
    return new Ok(null);
  }

  const { agents: agentCandidates, skills: skillCandidates } = result.value;
  const [agents, skills] = await Promise.all([
    AgentResource.fetchByIds(
      auth,
      agentCandidates.map(({ resourceId }) => resourceId)
    ),
    SkillResource.fetchByIds(
      auth,
      skillCandidates.map(({ resourceId }) => resourceId),
      {
        onlyActive: true,
        permissionFiltering: "strict",
        withFileAttachments: false,
        withInstructions: false,
        withTools: false,
      }
    ),
  ]);

  const readableAgentIds = new Set(
    agents
      .filter((agent) => agent.status === "active" && auth.can("read", agent))
      .map((agent) => agent.sId)
  );
  const readableSkillIds = new Set(skills.map((skill) => skill.sId));

  const items = [...agentCandidates, ...skillCandidates]
    .filter(({ resourceType, resourceId }) =>
      resourceType === "agent"
        ? readableAgentIds.has(resourceId)
        : readableSkillIds.has(resourceId)
    )
    .sort(compareDiscoveryTrendingCandidates)
    .slice(0, DISCOVERY_TRENDING_ITEM_LIMIT)
    .map(({ resourceType, resourceId }) => ({
      kind: resourceType,
      itemId: resourceId,
    }));

  return new Ok(items);
}
