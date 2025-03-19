import type { ExtensionWorkspaceType, UserType } from "@dust-tt/client";

export type UserTypeWithExtensionWorkspaces = UserType & {
  workspaces: ExtensionWorkspaceType[];
};

export type StoredTokens = {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
};

export type StoredUser = UserTypeWithExtensionWorkspaces & {
  connection?: string;
  connectionStrategy: string;
  dustDomain: string;
  selectedWorkspace: string | null;
};

// Common keys shared across all platforms.
export interface BaseStorageData {
  theme?: string;
  tokens?: StoredTokens;
  user?: StoredUser;
}

export interface StorageService<T extends BaseStorageData = BaseStorageData> {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  onChange?(callback: (changes: Record<string, any>) => void): () => void;
}
