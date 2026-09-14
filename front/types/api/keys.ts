import type { KeyType } from "@app/types/key";
import type { SpaceType } from "@app/types/space";

export type GetKeysResponseBody = {
  keys: KeyType[];
};

export type GetKeyScopableSpacesResponseBody = {
  spaces: SpaceType[];
};

export type PostKeysResponseBody = {
  key: KeyType;
};
