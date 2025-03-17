export declare const UNIQUE_SPACE_KINDS: readonly ["global", "system", "conversations"];
declare const SPACE_KINDS: readonly ["global", "system", "conversations", "public", "regular"];
export type SpaceKind = (typeof SPACE_KINDS)[number];
export type UniqueSpaceKind = (typeof UNIQUE_SPACE_KINDS)[number];
export type SpaceType = {
    createdAt: number;
    groupIds: string[];
    isRestricted: boolean;
    kind: SpaceKind;
    name: string;
    sId: string;
    updatedAt: number;
};
export declare function isUniqueSpaceKind(kind: SpaceKind): kind is UniqueSpaceKind;
export {};
//# sourceMappingURL=space.d.ts.map