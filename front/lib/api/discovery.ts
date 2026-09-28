import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { PinnedDiscoveryItemInput } from "@app/lib/resources/discovery_item_resource";
import { DiscoveryItemResource } from "@app/lib/resources/discovery_item_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { fetchDiscoveryForYouCandidates } from "@app/lib/search_usage/for_you";
import { fetchDiscoveryTrendingCandidates } from "@app/lib/search_usage/trending";
import type { SearchUsageDimension } from "@app/lib/search_usage/usage";
import type {
  DeleteGroupDiscoveryPinResponseBody,
  DiscoveryRankedItemType,
  GetFeaturedDiscoveryItemsResponseBody,
  GetGroupDiscoveryPinsResponseBody,
  PutGroupDiscoveryPinResponseBody,
} from "@app/types/api/discovery";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";

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
  if (!(await canManageGroupPins(auth, groupResult.value.id))) {
    return unauthorizedGroupPins();
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

async function canManageGroupPins(
  auth: Authenticator,
  groupModelId: number
): Promise<boolean> {
  if (auth.isAdmin()) {
    return true;
  }
  if (!auth.isManager()) {
    return false;
  }
  return (await auth.listPrincipalGroupModelIds()).includes(groupModelId);
}

function unauthorizedGroupPins(): Err<DiscoveryPinError> {
  return new Err(
    new DustError(
      "unauthorized",
      "Only workspace admins, or managers who belong to the group, can manage pinned discovery items."
    )
  );
}

const DISCOVERY_TRENDING_ITEMS_PER_KIND_LIMIT = 5;
const DISCOVERY_FOR_YOU_ITEM_LIMIT = 10;
const DISCOVERY_FOR_YOU_CANDIDATE_POOL_SIZE = 5 * DISCOVERY_FOR_YOU_ITEM_LIMIT;

async function resolveViewerVisibleItems(
  auth: Authenticator,
  candidates: { resourceType: SearchUsageDimension; resourceId: string }[]
): Promise<DiscoveryRankedItemType[]> {
  const { agentsById, skillsById } = await DiscoveryItemResource.loadTargets(
    auth,
    candidates.map(({ resourceType, resourceId }) => ({
      type: resourceType,
      itemId: resourceId,
    }))
  );

  return removeNulls(
    candidates.map(
      ({ resourceType, resourceId }): DiscoveryRankedItemType | null => {
        switch (resourceType) {
          case "agent": {
            const agent = agentsById.get(resourceId);
            return agent && auth.can("read", agent)
              ? { type: "agent", target: agent.toDiscoveryJSON() }
              : null;
          }
          case "skill": {
            const skill = skillsById.get(resourceId);
            return skill && auth.can("read", skill)
              ? { type: "skill", target: skill.toDiscoveryJSON() }
              : null;
          }
          default:
            return assertNever(resourceType);
        }
      }
    )
  );
}

export async function listDiscoveryTrendingItems(
  auth: Authenticator
): Promise<Result<DiscoveryRankedItemType[] | null, ElasticsearchError>> {
  const result = await fetchDiscoveryTrendingCandidates(auth);
  if (result.isErr()) {
    return result;
  }
  if (result.value === null) {
    return new Ok(null);
  }

  const visibleItems = await resolveViewerVisibleItems(auth, [
    ...result.value.agents,
    ...result.value.skills,
  ]);
  const visibleAgents = visibleItems.filter(({ type }) => type === "agent");
  const visibleSkills = visibleItems.filter(({ type }) => type === "skill");
  const items: DiscoveryRankedItemType[] = [];

  for (
    let index = 0;
    index < DISCOVERY_TRENDING_ITEMS_PER_KIND_LIMIT;
    index++
  ) {
    const agent = visibleAgents[index];
    const skill = visibleSkills[index];
    if (!agent && !skill) {
      break;
    }

    if (agent) {
      items.push(agent);
    }
    if (skill) {
      items.push(skill);
    }
  }

  return new Ok(items);
}

export async function listDiscoveryForYouItems(
  auth: Authenticator
): Promise<Result<DiscoveryRankedItemType[] | null, ElasticsearchError>> {
  const result = await fetchDiscoveryForYouCandidates(auth);
  if (result.isErr()) {
    return result;
  }
  if (result.value === null) {
    return new Ok(null);
  }

  const visibleItems = await resolveViewerVisibleItems(
    auth,
    result.value.slice(0, DISCOVERY_FOR_YOU_CANDIDATE_POOL_SIZE)
  );

  return new Ok(visibleItems.slice(0, DISCOVERY_FOR_YOU_ITEM_LIMIT));
}
