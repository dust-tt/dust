import { z } from "zod";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  getMcpServerViewDescription,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { HeaderRow } from "@app/types";
import { sanitizeHeadersArray } from "@app/types";

// Tool settings for a single tool.
export type ToolSettings = {
  enabled: boolean;
  permission: MCPToolStakeLevelType;
};

// Complete form values including all tabs.
export type MCPServerFormValues = {
  // Info tab fields
  name: string;
  description: string;
  icon?: string;
  sharedSecret?: string;
  customHeaders?: HeaderRow[] | null;

  // Tools tab - map of toolName to settings
  toolSettings: Record<string, ToolSettings>;

  // Sharing tab - map of spaceId to enabled/disabled
  sharingSettings: Record<string, boolean>;
};

export function getMCPServerFormDefaults(
  view: MCPServerViewType,
  mcpServerWithViews?: { views: Array<{ spaceId: string }> },
  spaces?: Array<{ sId: string; kind: string }>
): MCPServerFormValues {
  // Base info defaults.
  const baseDefaults = {
    name: view.name ?? view.server.name,
    description: getMcpServerViewDescription(view),
  };

  // Tool settings defaults.
  const toolSettings: Record<string, ToolSettings> = {};
  for (const tool of view.server.tools ?? []) {
    const metadata = view.toolsMetadata?.find((m) => m.toolName === tool.name);
    toolSettings[tool.name] = {
      enabled: metadata?.enabled ?? true,
      permission: metadata?.permission ?? "high",
    };
  }

  // Sharing settings defaults - which spaces have this server.
  // Only include regular and global spaces, not system spaces.
  const sharingSettings: Record<string, boolean> = {};
  if (mcpServerWithViews && spaces) {
    for (const serverView of mcpServerWithViews.views) {
      const space = spaces.find((s) => s.sId === serverView.spaceId);
      if (space && (space.kind === "regular" || space.kind === "global")) {
        sharingSettings[serverView.spaceId] = true;
      }
    }
  } else if (mcpServerWithViews) {
    // Fallback if spaces not provided (shouldn't happen in practice)
    for (const serverView of mcpServerWithViews.views) {
      sharingSettings[serverView.spaceId] = true;
    }
  }

  // Add remote-specific fields if applicable.
  if (isRemoteMCPServerType(view.server)) {
    return {
      ...baseDefaults,
      icon: view.server.icon,
      sharedSecret: view.server.sharedSecret ?? "",
      customHeaders: Object.entries(view.server.customHeaders ?? {}).map(
        ([key, value]) => ({
          key,
          value: String(value),
        })
      ),
      toolSettings,
      sharingSettings,
    };
  }

  return {
    ...baseDefaults,
    toolSettings,
    sharingSettings,
  };
}

export function getMCPServerFormSchema(view: MCPServerViewType) {
  const baseSchema = z.object({
    name: z.string().min(1, "Name is required."),
    description: z.string().min(1, "Description is required."),
    toolSettings: z.record(
      z.object({
        enabled: z.boolean(),
        permission: z.string(),
      })
    ),
    sharingSettings: z.record(z.boolean()),
  });

  if (isRemoteMCPServerType(view.server)) {
    return baseSchema.extend({
      icon: z.string().optional(),
      sharedSecret: z.string().optional(),
      customHeaders: z
        .array(
          z.object({
            key: z.string(),
            value: z.string(),
          })
        )
        .nullable()
        .optional(),
    });
  }
  return baseSchema;
}

type FormDiffType = {
  serverView?: { name: string; description: string };
  remoteIcon?: string;
  remoteSharedSecret?: string;
  remoteCustomHeaders?: HeaderRow[] | null;
  toolChanges?: Array<{
    toolName: string;
    enabled: boolean;
    permission: MCPToolStakeLevelType;
  }>;
  sharingChanges?: Array<{
    spaceId: string;
    action: "add" | "remove";
  }>;
};

export function diffMCPServerForm(
  initial: MCPServerFormValues,
  current: MCPServerFormValues,
  isRemote: boolean
): FormDiffType {
  const out: FormDiffType = {};

  // Check info changes.
  if (
    current.name !== initial.name ||
    current.description !== initial.description
  ) {
    out.serverView = {
      name: current.name,
      description: current.description,
    };
  }

  // Check remote-specific changes.
  if (isRemote) {
    if (current.icon && current.icon !== initial.icon) {
      out.remoteIcon = current.icon;
    }
    if (
      typeof current.sharedSecret === "string" &&
      current.sharedSecret !== initial.sharedSecret &&
      current.sharedSecret.length > 0
    ) {
      out.remoteSharedSecret = current.sharedSecret;
    }

    // Compare sanitized custom headers.
    const iSan = sanitizeHeadersArray(initial.customHeaders ?? []);
    const cSan = sanitizeHeadersArray(current.customHeaders ?? []);
    if (JSON.stringify(iSan) !== JSON.stringify(cSan)) {
      out.remoteCustomHeaders = cSan.length > 0 ? cSan : null;
    }
  }

  // Check tool changes.
  const toolChanges: typeof out.toolChanges = [];
  for (const [toolName, currentSettings] of Object.entries(
    current.toolSettings
  )) {
    const initialSettings = initial.toolSettings[toolName];
    if (
      initialSettings &&
      (initialSettings.enabled !== currentSettings.enabled ||
        initialSettings.permission !== currentSettings.permission)
    ) {
      toolChanges.push({
        toolName,
        enabled: currentSettings.enabled,
        permission: currentSettings.permission as MCPToolStakeLevelType,
      });
    }
  }
  if (toolChanges.length > 0) {
    out.toolChanges = toolChanges;
  }

  // Check sharing changes.
  const sharingChanges: typeof out.sharingChanges = [];
  const allSpaceIds = new Set([
    ...Object.keys(initial.sharingSettings),
    ...Object.keys(current.sharingSettings),
  ]);
  for (const spaceId of allSpaceIds) {
    const wasEnabled = initial.sharingSettings[spaceId] ?? false;
    const isEnabled = current.sharingSettings[spaceId] ?? false;
    if (wasEnabled !== isEnabled) {
      sharingChanges.push({
        spaceId,
        action: isEnabled ? "add" : "remove",
      });
    }
  }
  if (sharingChanges.length > 0) {
    out.sharingChanges = sharingChanges;
  }

  return out;
}
