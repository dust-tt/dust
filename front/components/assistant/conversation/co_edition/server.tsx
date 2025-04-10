import type { LightWorkspaceType } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";

import {
  insertNodes,
  registerTipTapTools,
} from "@app/components/assistant/conversation/co_edition/tools/tip_tap";
import type { InitialNode } from "@app/components/assistant/conversation/co_edition/tools/toggle_co_edition";
import { registerToggleTool } from "@app/components/assistant/conversation/co_edition/tools/toggle_co_edition";
import type { CoEditionTransport } from "@app/components/assistant/conversation/co_edition/transport";

export interface CoEditionState {
  isEnabled: boolean;
  pendingInitialNodes?: InitialNode[];
}

export class CoEditionServer {
  private server: McpServer;
  private transport: CoEditionTransport | null = null;
  private state: CoEditionState = {
    isEnabled: false,
  };
  private editor: Editor | null = null;
  private onStateChange?: (state: CoEditionState) => void;
  private owner: LightWorkspaceType;

  constructor(owner: LightWorkspaceType) {
    this.owner = owner;
    this.server = this.createServer();
  }

  setEditor(editor: Editor) {
    this.editor = editor;

    // Apply any pending initial content if co-edition is enabled
    if (this.state.isEnabled && this.state.pendingInitialNodes) {
      this.state.pendingInitialNodes.forEach((node, idx) => {
        insertNodes(this.editor, {
          position: idx,
          content: node.content,
        });
      });

      // Clear the pending content after applying it
      this.state.pendingInitialNodes = undefined;
      this.onStateChange?.(this.state);
    }

    // Recreate server to register TipTap tools with editor.
    if (this.state.isEnabled) {
      registerTipTapTools(this.server, this.editor);
    }
  }

  private createServer(): McpServer {
    const server = new McpServer({
      name: "co-edition",
      version: "1.0.0",
    });

    // Always register toggle tool.
    registerToggleTool(server, this.handleToggle);

    // Register TipTap tools only if enabled and editor is available
    if (this.state.isEnabled && this.editor) {
      registerTipTapTools(server, this.editor);
    }

    return server;
  }

  private handleToggle = async (
    enabled: boolean,
    initialNodes?: InitialNode[]
  ) => {
    if (this.state.isEnabled === enabled) {
      return;
    }

    this.state = {
      ...this.state,
      isEnabled: enabled,
      // Store initial content in state if provided
      pendingInitialNodes: enabled ? initialNodes : undefined,
    };

    console.log("initialNodes", initialNodes);

    // Register TipTap tools with editor.
    if (this.editor) {
      registerTipTapTools(this.server, this.editor);

      // If initial content is provided and we're enabling co-edition, set it in the editor
      if (enabled && initialNodes && this.editor) {
        initialNodes.map((node, idx) => {
          insertNodes(this.editor, {
            position: idx,
            content: node.content,
          });
        });

        // Clear the pending content after applying it
        this.state.pendingInitialNodes = undefined;
      }
    }

    this.onStateChange?.(this.state);
  };

  async connect(transport: CoEditionTransport): Promise<void> {
    if (this.transport) {
      await this.transport.close();
    }

    await this.server.connect(transport);
    this.transport = transport;
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  getServer(): McpServer {
    return this.server;
  }

  getState(): CoEditionState {
    return this.state;
  }

  isCoEditionEnabled(): boolean {
    // return this.transport !== null && this.state.isEnabled;
    return true;
  }

  onStateUpdate(callback: (state: CoEditionState) => void) {
    this.onStateChange = callback;
  }
}
