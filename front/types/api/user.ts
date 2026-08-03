import type {
  RoleType,
  UserMetadataType,
  UserTypeWithWorkspaces,
} from "@app/types/user";

export type GetMemberResponseBody = {
  member: {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string | null;
    fullName: string;
    image: string | null;
    revoked: boolean;
    role: RoleType;
    startAt: string | null;
    endAt: string | null;
  };
};

export type PostMemberResponseBody = {
  member: UserTypeWithWorkspaces;
};

export type GetUserResponseBody = {
  user: UserTypeWithWorkspaces & { subscriberHash: string | null };
};

export type PostUserMetadataResponseBody = {
  success: boolean;
};

export type GetUserMetadataResponseBody = {
  metadata: UserMetadataType | null;
};

export type PostUserMetadataKeyResponseBody = {
  metadata: UserMetadataType;
};
