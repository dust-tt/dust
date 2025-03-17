import { ModelId } from "../shared/model_id";
/**
 * system group:
 * Accessible by no-one other than our system API keys.
 * Has access to the system Space which holds the connected data sources.
 *
 * global group:
 * Contains all users from the workspace.
 * Has access to the global Space which holds all existing datasource created before spaces.
 *
 * regular group:
 * Contains specific users added by workspace admins.
 * Has access to the list of spaces configured by workspace admins.
 */
export declare const GROUP_KINDS: readonly ["regular", "global", "system"];
export type GroupKind = (typeof GROUP_KINDS)[number];
export declare function isGroupKind(value: unknown): value is GroupKind;
export declare function isSystemGroupKind(value: GroupKind): boolean;
export declare function isGlobalGroupKind(value: GroupKind): boolean;
export declare function prettifyGroupName(group: GroupType): string;
export type GroupType = {
    id: ModelId;
    name: string;
    sId: string;
    kind: GroupKind;
    workspaceId: ModelId;
};
export declare function getGroupIdsFromHeaders(headers: Record<string, string | string[] | undefined>): string[] | undefined;
export declare function getHeaderFromGroupIds(groupIds: string[] | undefined): {
    "X-Dust-Group-Ids": string;
} | undefined;
//# sourceMappingURL=groups.d.ts.map