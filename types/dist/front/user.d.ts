import * as t from "io-ts";
import { EmbeddingProviderIdType, ModelProviderIdType } from "../front/lib/assistant";
import { ModelId } from "../shared/model_id";
export type WorkspaceSegmentationType = "interesting" | null;
export declare const ROLES: readonly ["admin", "builder", "user", "none"];
export declare const ACTIVE_ROLES: readonly ["admin", "builder", "user"];
export declare const RoleSchema: t.KeyofC<{
    admin: null;
    builder: null;
    user: null;
    none: null;
}>;
export type RoleType = t.TypeOf<typeof RoleSchema>;
export declare const ActiveRoleSchema: t.KeyofC<{
    admin: null;
    builder: null;
    user: null;
}>;
export type ActiveRoleType = t.TypeOf<typeof ActiveRoleSchema>;
export declare function isActiveRoleType(role: string): role is ActiveRoleType;
export type LightWorkspaceType = {
    id: ModelId;
    sId: string;
    name: string;
    role: RoleType;
    segmentation: WorkspaceSegmentationType;
    whiteListedProviders: ModelProviderIdType[] | null;
    defaultEmbeddingProvider: EmbeddingProviderIdType | null;
    metadata: Record<string, string | number | boolean | object> | null;
};
export type WorkspaceType = LightWorkspaceType & {
    ssoEnforced?: boolean;
};
export type ExtensionWorkspaceType = WorkspaceType & {
    blacklistedDomains: string[] | null;
};
export type UserProviderType = "auth0" | "github" | "google" | "okta" | "samlp" | "waad" | null;
export type UserType = {
    sId: string;
    id: ModelId;
    createdAt: number;
    provider: UserProviderType;
    username: string;
    email: string;
    firstName: string;
    lastName: string | null;
    fullName: string;
    image: string | null;
};
export type UserTypeWithWorkspaces = UserType & {
    workspaces: WorkspaceType[];
};
export type UserTypeWithExtensionWorkspaces = UserType & {
    workspaces: ExtensionWorkspaceType[];
};
export type UserMetadataType = {
    key: string;
    value: string;
};
export declare function formatUserFullName(user?: {
    firstName?: string;
    lastName?: string | null;
}): string | null;
export declare function isAdmin(owner: WorkspaceType | null): owner is WorkspaceType & {
    role: "admin";
};
export declare function isBuilder(owner: WorkspaceType | null): owner is WorkspaceType & {
    role: "builder" | "admin";
};
export declare function isUser(owner: WorkspaceType | null): owner is WorkspaceType & {
    role: "user" | "builder" | "admin";
};
export declare function isOnlyUser(owner: WorkspaceType | null): owner is WorkspaceType & {
    role: "user";
};
export declare function isOnlyBuilder(owner: WorkspaceType | null): owner is WorkspaceType & {
    role: "builder";
};
export declare function isOnlyAdmin(owner: WorkspaceType | null): owner is WorkspaceType & {
    role: "admin";
};
export declare function getUserEmailFromHeaders(headers: {
    [key: string]: string | string[] | undefined;
}): string | undefined;
export declare function getHeaderFromUserEmail(email: string | undefined): {
    "x-api-user-email": string;
} | undefined;
//# sourceMappingURL=user.d.ts.map