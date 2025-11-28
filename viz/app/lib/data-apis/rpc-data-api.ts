import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import type {
  VisualizationRPCCommand,
  CommandResultMap,
  VisualizationRPCRequestMap,
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

  async fetchFile(fileId: string): Promise<File | null> {
    try {
      console.log(">> RPCDataAPI: Fetching file via RPC", this.sendMessage);

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
      console.log(">> RPCDataAPI: Fetching code via RPC", this.sendMessage);
      const result = await this.sendMessage("getCodeToExecute", null);
      const { code } = result;
      return code || null;
    } catch (error) {
      console.error("Failed to fetch code via RPC:", error);
      return null;
    }
  }
}
