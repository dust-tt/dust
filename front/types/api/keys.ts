import type { GroupType } from "@app/types/groups";
import type { KeyType } from "@app/types/key";
import type { SpaceType } from "@app/types/space";

export type GetKeysResponseBody = {
  keys: KeyType[];
};

// The groups the caller may scope a new API key to (the groups they are a
// member of). Served by GET /api/w/:wId/keys/groups.
export type GetKeyScopableGroupsResponseBody = {
  groups: GroupType[];
};

export type GetKeyScopableSpacesResponseBody = {
  spaces: SpaceType[];
};

export type PostKeysResponseBody = {
  key: KeyType;
};
