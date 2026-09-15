import {
  normalizeSandboxFunctionCallError,
  SandboxFunctionCallError,
} from "@viz/app/lib/data-apis/sandbox-function-call-error";
import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import type {
  CommandResultMap,
  VisualizationRPCCommand,
  VisualizationRPCRequestMap,
} from "@viz/app/types";

export type HostLivenessState = "unknown" | "alive" | "unresponsive";

interface RPCDataAPIOptions {
  // Whether a separate host window exists to answer RPC messages. Defaults to detecting a
  // top-level browser window (window.parent === window), where postMessage RPC can never be
  // answered. SSR constructs the API without a `window` and never calls functions, so the
  // detection defaults to true there.
  hasHostWindow?: boolean;
}

function detectHostWindow(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.parent !== window;
}

/**
 * RPC-based data API for client-side components
 * Uses cross-document messaging to fetch data from the parent window.
 */
export class RPCDataAPI implements VisualizationDataAPI {
  private sendMessage: <T extends VisualizationRPCCommand>(
    command: T,
    params: VisualizationRPCRequestMap[T]
  ) => Promise<CommandResultMap[T]>;

  private readonly hasHostWindow: boolean;
  private _hostLiveness: HostLivenessState = "unknown";

  constructor(
    sendMessage: <T extends VisualizationRPCCommand>(
      command: T,
      params: VisualizationRPCRequestMap[T]
    ) => Promise<CommandResultMap[T]>,
    options?: RPCDataAPIOptions
  ) {
    this.sendMessage = sendMessage;
    this.hasHostWindow = options?.hasHostWindow ?? detectHostWindow();

    if (this.hasHostWindow) {
      // Probe host liveness once per mount. The transport bounds the ping with its own
      // timeout, so this settles either way. An unanswered ping is recorded but does not
      // change behavior: embedded hosts that predate the ping command are treated as
      // legacy and keep the pre-ping semantics.
      void this.probeHostLiveness();
    } else {
      this._hostLiveness = "unresponsive";
    }
  }

  get hostLiveness(): HostLivenessState {
    return this._hostLiveness;
  }

  private async probeHostLiveness(): Promise<void> {
    try {
      await this.sendMessage("ping", null);
      this._hostLiveness = "alive";
    } catch (_error) {
      this._hostLiveness = "unresponsive";
    }
  }

  async callFunction(functionId: string, input?: unknown): Promise<unknown> {
    if (!this.hasHostWindow) {
      // Top-level window: there is no host to serve the call, so the RPC below would hang
      // forever (only getUserIdentity has a transport timeout). Fail fast with the code
      // frames already branch on for hostless contexts.
      throw new SandboxFunctionCallError({
        code: "not_supported",
        message: `Sandbox function ${functionId} cannot be called: no host window is available to serve function calls.`,
      });
    }

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

  async fetchFile(fileId: string): Promise<File | null> {
    try {
      console.log(">> RPCDataAPI: Fetching file via RPC", fileId);

      const res = await this.sendMessage("getFile", { fileId });
      const { fileBlob: blob } = res;

      if (!blob) {
        return null;
      }

      return new File([blob], fileId, { type: blob.type });
    } catch (error) {
      console.error(`Failed to fetch file ${fileId} via RPC:`, error);
      return null;
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
