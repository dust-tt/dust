import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";

import { registerEditorTools } from "@app/components/assistant/conversation/co_edition/tools/editor";
import type { InitialNode } from "@app/components/assistant/conversation/co_edition/tools/toggle_co_edition";
import { registerToggleTool } from "@app/components/assistant/conversation/co_edition/tools/toggle_co_edition";
import type { CoEditionTransport } from "@app/components/assistant/conversation/co_edition/transport";

export interface CoEditionState {
  isEnabled: boolean;
  initialNodes?: InitialNode[];
}

export class CoEditionServer {
  private server: McpServer;
  private transport: CoEditionTransport | null = null;
  private state: CoEditionState = {
    isEnabled: false,
  };
  private editor: Editor | null = null;
  private onStateChange?: (state: CoEditionState) => void;

  constructor() {
    this.server = this.createServer();
  }

  setEditor(editor: Editor) {
    this.editor = editor;

    // Register editor tools if co-edition is enabled.
    if (this.state.isEnabled) {
      registerEditorTools(this.server, this.editor);
    }
  }

  private createServer(): McpServer {
    const server = new McpServer({
      name: "co-edition",
      version: "1.0.0",
    });

    // Always register toggle tool.
    registerToggleTool(server, this.handleToggle);

    // Register editor tools only if enabled and editor is available.
    if (this.state.isEnabled && this.editor) {
      registerEditorTools(server, this.editor);
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
      // Store initial content in state if provided.
      initialNodes: enabled ? initialNodes : undefined,
    };

    // Register edition tools with editor if available.
    if (this.editor) {
      registerEditorTools(this.server, this.editor);
    }

    this.onStateChange?.(this.state);
  };

  // Method to clear initial nodes after they've been applied.
  clearInitialNodes() {
    this.state.initialNodes = undefined;
    this.onStateChange?.(this.state);
  }

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
    return this.transport !== null && this.state.isEnabled;
  }

  onStateUpdate(callback: (state: CoEditionState) => void) {
    this.onStateChange = callback;
  }
}
