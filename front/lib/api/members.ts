import type { LightUserType, UserType } from "@app/types/user";

// The lookup endpoint is queried by numeric ModelId, so the response must
// include `id` so callers can correlate results back to the requested ids.
export type LightLookupUserType = LightUserType & { id: number };

export type MembersLookupResponseBody = {
  users: LightLookupUserType[];
};

export type MembersLookupAdminResponseBody = {
  users: UserType[];
};
