export const GROUP_PINNED_ITEM_TYPES = ["agent", "skill"] as const;
export type GroupPinnedItemType = (typeof GROUP_PINNED_ITEM_TYPES)[number];
