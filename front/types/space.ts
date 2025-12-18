export const UNIQUE_SPACE_KINDS = [
  "global", // Also known as "company data", by definition, this space is shared by all users in the workspace.
  "system", // Used for admins to configure the workspace datasources and other system-wide settings.
  "conversations", // Space to hold conversations uploaded and generated files (legacy).
] as const;

export const SPACE_KINDS = [
  ...UNIQUE_SPACE_KINDS,
  "public", // Anyone can access it.
  "regular", // Can be open or restricted based on the groups assigned to the space (if the global group is assigned, it's open, otherwise it's restricted).
] as const;

export type SpaceKind = (typeof SPACE_KINDS)[number];

export type UniqueSpaceKind = (typeof UNIQUE_SPACE_KINDS)[number];
export type SpaceType = {
  conversationsEnabled: boolean;
  createdAt: number;
  groupIds: string[];
  isRestricted: boolean;
  kind: SpaceKind;
  managementMode: "manual" | "group";
  name: string;
  sId: string;
  updatedAt: number;
};

export function isUniqueSpaceKind(kind: SpaceKind): kind is UniqueSpaceKind {
  return UNIQUE_SPACE_KINDS.includes(kind as UniqueSpaceKind);
}

export function supportsConversations(kind: SpaceKind): boolean {
  // This is a bit confusing (but temporary) because the "conversations" kind is a special kind of space to hold conversations files (legacy).
  // In the future, we will move the conversations files of a conversation to the space of the conversation.
  // But to be able to fully migrate, we will need a "personal" space for each user for private conversations.
  return kind === "global" || kind === "regular";
}
