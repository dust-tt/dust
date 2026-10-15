import { SandboxFunctionCallError } from "@viz/app/lib/data-apis/sandbox-function-call-error";
import { extractFileRefs, fileRefKey } from "@viz/app/lib/parseFileRefs";
import type {
  FrameFile,
  VisualizationDataAPI,
} from "@viz/app/lib/visualization-api";
import type {
  UserIdentityState,
  WriteFileParams,
  WriteFileResult,
} from "@viz/app/types";

const FRAME_MIME_TYPES = new Set([
  "application/vnd.dust.frame",
  "application/vnd.dust.frame.slideshow",
]);

/**
 * Read-only data API for shared frames. Code comes from the server render; files are downloaded
 * from the viz shared-files relay with the frame's access token and memoized per key.
 */
export class CacheDataAPI implements VisualizationDataAPI {
  private readonly code: string | null;
  private readonly accessToken: string | null;
  private readonly fileDownloads = new Map<string, Promise<FrameFile | null>>();

  constructor({
    code,
    accessToken,
  }: { code?: string; accessToken?: string } = {}) {
    this.code = code || null;
    this.accessToken = accessToken || null;
  }

  /**
   * @cc [owner:tdraier,label:product;performance] shared-frame-eager-prefetch
   * MUST start downloading every file referenced by the frame code, including the refs of nested
   * frames, as soon as it is called and without a concurrency bound: the viz access token expires
   * one minute after it is issued, so a deferred download would fail.
   */
  async prefetchReferencedFiles(): Promise<void> {
    if (this.code) {
      await this.prefetchRefsOf(this.code, new Set());
    }
  }

  private async prefetchRefsOf(code: string, visited: Set<string>) {
    await Promise.all(
      extractFileRefs(code).map(async (ref) => {
        const key = fileRefKey(ref);
        if (visited.has(key)) {
          return;
        }
        visited.add(key);

        const frameFile = await this.fetchFile(key);
        if (frameFile && FRAME_MIME_TYPES.has(frameFile.file.type)) {
          await this.prefetchRefsOf(await frameFile.file.text(), visited);
        }
      })
    );
  }

  async callFunction(functionId: string): Promise<unknown> {
    throw new SandboxFunctionCallError({
      code: "not_supported",
      message: `Sandbox function ${functionId} is not supported in public frames.`,
    });
  }

  async getUserIdentity(): Promise<UserIdentityState> {
    return {
      isAuthenticated: false,
      isWorkspaceMember: false,
      isFrameAuthor: false,
      isPodEditor: false,
      isPodMember: false,
      user: null,
    };
  }

  fetchFile(fileId: string): Promise<FrameFile | null> {
    let download = this.fileDownloads.get(fileId);
    if (!download) {
      download = this.downloadFile(fileId);
      this.fileDownloads.set(fileId, download);
    }
    return download;
  }

  private async downloadFile(fileId: string): Promise<FrameFile | null> {
    if (!this.accessToken) {
      return null;
    }

    const params = new URLSearchParams({ fileRef: fileId });
    try {
      const response = await fetch(`/api/shared-files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        cache: "no-store",
      });
      if (!response.ok) {
        return null;
      }
      const file = new File([await response.arrayBuffer()], fileId, {
        type:
          response.headers.get("content-type") ?? "application/octet-stream",
      });
      return { file, revision: null, canWrite: false };
    } catch {
      return null;
    }
  }

  async writeFile(_params: WriteFileParams): Promise<WriteFileResult> {
    return {
      success: false,
      error: { code: "read_only", message: "This Frame is read-only." },
    };
  }

  async fetchCode(): Promise<string | null> {
    return this.code;
  }
}
