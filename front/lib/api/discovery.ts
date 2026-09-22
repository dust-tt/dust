import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { PinnedDiscoveryItemInput } from "@app/lib/resources/discovery_item_resource";
import { DiscoveryItemResource } from "@app/lib/resources/discovery_item_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  DeleteGroupDiscoveryPinResponseBody,
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
