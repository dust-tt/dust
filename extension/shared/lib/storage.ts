import type { Auth0AuthorizeResponse } from "@app/shared/lib/messages";
import type { UploadedContentFragmentTypeWithKind } from "@app/shared/lib/types";
import type {
  ContentFragmentType,
  ExtensionWorkspaceType,
  UserType,
} from "@dust-tt/client";

export type UserTypeWithExtensionWorkspaces = UserType & {
  workspaces: ExtensionWorkspaceType[];
};

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type StoredUser = UserTypeWithExtensionWorkspaces & {
  selectedWorkspace: string | null;
  dustDomain: string;
  connectionStrategy: string;
  connection?: string;
};

/**
 * Tokens.
 * We store the access token, refresh token, and expiration time in Chrome storage.
 */

export const saveTokens = async (
  rawTokens: Auth0AuthorizeResponse
): Promise<StoredTokens> => {
  const tokens: StoredTokens = {
    accessToken: rawTokens.accessToken,
    refreshToken: rawTokens.refreshToken,
    expiresAt: Date.now() + rawTokens.expiresIn * 1000,
  };
  await chrome.storage.local.set(tokens);
  return tokens;
};

export const getStoredTokens = async (): Promise<StoredTokens | null> => {
  const result = await chrome.storage.local.get([
    "accessToken",
    "refreshToken",
    "expiresAt",
  ]);

  if (result.accessToken && result.expiresAt) {
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    };
  }
  return null;
};

type ConversationContext = {
  includeCurrentPage: boolean;
};

export const getConversationContext = async (
  conversationId: string
): Promise<ConversationContext> => {
  const { conversationContext = {} } = await chrome.storage.local.get([
    "conversationContext",
  ]);
  return conversationContext[conversationId] ?? { includeCurrentPage: false };
};

export const setConversationsContext = async (
  conversationsWithContext: Record<string, ConversationContext>
) => {
  const result = await chrome.storage.local.get(["conversationContext"]);
  const v = result.conversationContext ?? {};
  Object.assign(v, conversationsWithContext);
  await chrome.storage.local.set({ conversationContext: v });
};

/**
 * User.
 * We store the basic user information with list of workspaces and currently selected workspace in Chrome storage.
 */

export const saveUser = async (user: StoredUser): Promise<StoredUser> => {
  await chrome.storage.local.set({ user });
  return user;
};

export const saveSelectedWorkspace = async (
  workspaceId: string
): Promise<StoredUser> => {
  const storedUser = await getStoredUser();
  if (!storedUser) {
    throw new Error("No user found.");
  }
  storedUser.selectedWorkspace = workspaceId;
  await chrome.storage.local.set({ user: storedUser });
  return storedUser;
};

export const getStoredUser = async (): Promise<StoredUser | null> => {
  const result = await chrome.storage.local.get(["user"]);
  return result.user ?? null;
};

/**
 * Store version for force update.
 */

export type PendingUpdate = {
  version: string;
  detectedAt: number;
};
export const savePendingUpdate = async (
  pendingUpdate: PendingUpdate
): Promise<PendingUpdate> => {
  await chrome.storage.local.set({ pendingUpdate });
  return pendingUpdate;
};
export const getPendingUpdate = async (): Promise<PendingUpdate | null> => {
  const result = await chrome.storage.local.get(["pendingUpdate"]);
  return result.pendingUpdate ?? null;
};

/**
 * Clear all stored data.
 */

export const clearStoredData = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(
      ["accessToken", "refreshToken", "expiresAt", "user"],
      () => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        return resolve();
      }
    );
  });
};

function getTabContentKey(
  conversationId: string,
  rawUrl: string,
  title: string
) {
  return `tabContentContentFragmentId_${conversationId}_${rawUrl}_${title}`;
}

/**
 * Saves the mapping between TabContent (based on conversation id and url) and content fragment id.
 * Doesn't save anything for files that are not tab content.
 * Needs to be called after calling postMessage or createConversation with:
 * - the conversation id
 * - the files that were uploaded (including the "kind", either attachment or tab_content)
 * - the content fragments that were created
 *
 * This mapping is then used such that we supersede existing tab content content fragments
 * with the newly created ones if it's for the same URL / conversation.
 */
export const saveFilesContentFragmentIds = async ({
  conversationId,
  uploadedFiles,
  createdContentFragments,
}: {
  conversationId: string;
  uploadedFiles: UploadedContentFragmentTypeWithKind[];
  createdContentFragments: ContentFragmentType[];
}) => {
  const tabContentFileIds = new Set(
    uploadedFiles.filter((f) => f.kind === "tab_content").map((f) => f.fileId)
  );
  if (tabContentFileIds.size === 0) {
    return;
  }

  const tabContentContentFragments = createdContentFragments.filter(
    (cf) =>
      cf.fileId &&
      tabContentFileIds.has(cf.fileId) &&
      cf.contentFragmentVersion === "latest"
  );

  for (const cf of tabContentContentFragments) {
    if (!cf.sourceUrl) {
      continue;
    }
    const key = getTabContentKey(conversationId, cf.sourceUrl, cf.title);
    await chrome.storage.local.set({
      [key]: cf.contentFragmentId,
    });
  }
};

/**
 * Retrieves the content fragment ID to supersede for a given file.
 * Always returns null if the file is not a tab content.
 */
export const getFileContentFragmentId = async (
  conversationId: string,
  file: UploadedContentFragmentTypeWithKind
): Promise<string | null> => {
  if (file.kind !== "tab_content" || !file.url) {
    return null;
  }
  const key = getTabContentKey(conversationId, file.url, file.title);
  const result = await chrome.storage.local.get([key]);
  return result[key] ?? null;
};

const DEFAULT_THEME = "system";

export const getTheme = async (): Promise<string> => {
  const result = await chrome.storage.local.get(["theme"]);
  return result.theme ?? DEFAULT_THEME;
};

export const saveTheme = async (theme: string) => {
  await chrome.storage.local.set({ theme });
};
