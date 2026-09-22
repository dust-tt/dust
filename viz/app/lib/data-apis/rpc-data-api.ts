import { normalizeSandboxFunctionCallError } from "@viz/app/lib/data-apis/sandbox-function-call-error";
import type {
  FrameFile,
  VisualizationDataAPI,
} from "@viz/app/lib/visualization-api";
import type {
  CommandResultMap,
  VisualizationRPCCommand,
  VisualizationRPCRequestMap,
  WriteFileParams,
  WriteFileResult,
} from "@viz/app/types";

/**
 * RPC-based data API for client-side components
 * Uses cross-document messaging to fetch data from the parent window.
 */
export class RPCDataAPI implements VisualizationDataAPI {
  private sendMessage: <T extends VisualizationRPCCommand>(
    command: T,
    params: VisualizationRPCRequestMap[T]
  ) => Promise<CommandResultMap[T]>;

  constructor(
    sendMessage: <T extends VisualizationRPCCommand>(
      command: T,
      params: VisualizationRPCRequestMap[T]
    ) => Promise<CommandResultMap[T]>
  ) {
    this.sendMessage = sendMessage;
  }

  async callFunction(functionId: string, input?: unknown): Promise<unknown> {
    try {
      return await this.sendMessage("callFunction", {
        functionIdOrSlug: functionId,
        input,
      });
    } catch (error) {
      throw normalizeSandboxFunctionCallError(error);
    }
  }

  async getUserIdentity() {
    const identity = await this.sendMessage("getUserIdentity", null);
    // Hosts deployed before the field existed answer without it; absent means false. Rebuild
    // the anonymous state rather than passing it through so the field is present either way.
    if (!identity.isAuthenticated) {
      return {
        isAuthenticated: false as const,
        isWorkspaceMember: false as const,
        isFrameAuthor: false as const,
        isPodEditor: false as const,
        isPodMember: false as const,
        user: null,
      };
    }
    return {
      ...identity,
      isFrameAuthor: identity.isFrameAuthor === true,
      isPodEditor: identity.isPodEditor === true,
      isPodMember: identity.isPodMember === true,
    };
  }

  /**
   * @cc [owner:flvndvd,label:api] frame-file-read-compatibility
   * File reads MUST use the existing getFile request and accept responses without
   * revision metadata. Missing metadata MUST disable writes.
   */
  async fetchFile(fileId: string): Promise<FrameFile | null> {
    let result: CommandResultMap["getFile"];
    try {
      result = await this.sendMessage("getFile", { fileId });
    } catch {
      return null;
    }

    const { fileBlob } = result;
    if (!fileBlob) {
      return null;
    }

    const revision = result.revision ?? null;
    return {
      file: new File([fileBlob], fileId, { type: fileBlob.type }),
      revision,
      canWrite: result.canWrite === true && revision !== null,
    };
  }

  async writeFile(params: WriteFileParams): Promise<WriteFileResult> {
    try {
      return await this.sendMessage("writeFile", params);
    } catch {
      return {
        success: false,
        error: {
          code: "save_failed",
          message:
            "Could not confirm the save. Reload the file before trying again.",
        },
      };
    }
  }

  async fetchCode(): Promise<string | null> {
    try {
      const result = await this.sendMessage("getCodeToExecute", null);
      const { code } = result;
      return code || null;
    } catch (error) {
      console.error("Failed to fetch code via RPC:", error);
      return null;
    }
  }
}
