import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const CONVERSATION_SIDE_PANEL_SERVER_NAME =
  "conversation_side_panel" as const;

export const OPEN_FRAME_TOOL_NAME = "open_frame" as const;
export const SET_FILES_SIDE_PANEL_TOOL_NAME = "set_files_side_panel" as const;

export const CONVERSATION_SIDE_PANEL_TOOLS_METADATA = [
  {
    name: OPEN_FRAME_TOOL_NAME,
    description:
      "Open and show an existing Frame in the conversation side panel without modifying it. " +
      "Use this when a Frame was already created and you want the user to see it now " +
      "(for example after referring back to a prior Frame). Creating, editing, reverting, " +
      "renaming, or publishing a Frame already opens it automatically — call this only to " +
      "re-open a Frame that is not currently shown.",
    schema: {
      file_id: z
        .string()
        .describe(
          "The ID of the Interactive Content file to open (e.g., 'fil_abc123')"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Opening Frame",
      done: "Open Frame",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SET_FILES_SIDE_PANEL_TOOL_NAME,
    description:
      "Show or hide the conversation files side panel in the UI. Use `visible: true` to open " +
      "the file explorer so the user can browse conversation files, or `visible: false` to close " +
      "it when it is open. This does not open a Frame; use `open_frame` for that.",
    schema: {
      visible: z
        .boolean()
        .describe(
          "Whether the files side panel should be visible. `true` opens it; `false` closes it " +
            "when the files panel is currently open."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Updating files panel",
      done: "Update files panel",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const CONVERSATION_SIDE_PANEL_SERVER = {
  serverInfo: {
    name: CONVERSATION_SIDE_PANEL_SERVER_NAME,
    version: "1.0.0",
    description:
      "Control the conversation side panel: open a Frame, or show/hide the files explorer.",
    icon: "ActionFrameIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: CONVERSATION_SIDE_PANEL_TOOLS_METADATA,
} as const satisfies ServerMetadata;
