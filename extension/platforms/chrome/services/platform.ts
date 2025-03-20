import { ChromeAuthService } from "@app/platforms/chrome/services/auth";
import { ChromeStorageService } from "@app/platforms/chrome/services/storage";
import type { UploadedContentFragmentTypeWithKind } from "@app/shared/lib/types";
import { BasePlatformService } from "@app/shared/services/platform";
import type { ContentFragmentType } from "@dust-tt/client";

function getTabContentKey(
  conversationId: string,
  rawUrl: string,
  title: string
) {
  return `tabContentContentFragmentId_${conversationId}_${rawUrl}_${title}`;
}

export interface PendingUpdate {
  detectedAt: number;
  version: string;
}

export class ChromePlatformService extends BasePlatformService {
  constructor() {
    super("chrome", ChromeAuthService, new ChromeStorageService());
  }

  /**
   * Retrieves the content fragment ID to supersede for a given file.
   * Always returns null if the file is not a tab content.
   */
  async getFileContentFragmentId(
    conversationId: string,
    file: UploadedContentFragmentTypeWithKind
  ) {
    if (file.kind !== "tab_content" || !file.url) {
      return null;
    }

    const key = getTabContentKey(conversationId, file.url, file.title);
    const result = await this.storage.get<string>(key);
    return result ?? null;
  }

  /**
   * Saves the mapping between TabContent (based on conversation id and url) and content fragment id.
   * Doesn't save anything for files that are not tab content.
   * Needs to be called after calling postMessage or createConversation with:
   * - the conversation id
   * - the files that were uploaded (including the "kind", either attachment or tab_content)
   * - the content fragments that were created
   *
   * This mapping is then used such that we superseed existing tab content content fragments
   * with the newly created ones if it's for the same URL / conversation.
   */
  async saveFilesContentFragmentIds({
    conversationId,
    createdContentFragments,
    uploadedFiles,
  }: {
    conversationId: string;
    createdContentFragments: ContentFragmentType[];
    uploadedFiles: UploadedContentFragmentTypeWithKind[];
  }) {
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
      await this.storage.set(key, cf.contentFragmentId);
    }
  }

  // Chrome specific helpers.

  // Store version for force update.
  async savePendingUpdate(
    pendingUpdate: PendingUpdate
  ): Promise<PendingUpdate> {
    await this.storage.set("pendingUpdate", pendingUpdate);

    return pendingUpdate;
  }

  async getPendingUpdate(): Promise<PendingUpdate | null> {
    const result = await this.storage.get<PendingUpdate>("pendingUpdate");

    return result ?? null;
  }
}
