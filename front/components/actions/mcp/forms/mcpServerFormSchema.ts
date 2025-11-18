import { z } from "zod";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  getMcpServerViewDescription,
  isRemoteMCPServerType,
  supportsBearerTokenConfiguration,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { HeaderRow } from "@app/types";
import { sanitizeHeadersArray } from "@app/types";

// Tool settings for a single tool.
export type ToolSettings = {
  enabled: boolean;
  permission: MCPToolStakeLevelType;
};

// Server settings fields (Info tab).
export type ServerSettings = {
  name: string;
  description: string;
  icon?: string;
  sharedSecret?: string;
  customHeaders?: HeaderRow[] | null;
};

// Complete form values including all tabs.
export type MCPServerFormValues = ServerSettings & {
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
  const supportsBearerToken = supportsBearerTokenConfiguration(view.server);

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
  // Initialize ALL spaces (regular and global) with false, then set enabled ones to true.
  const sharingSettings: Record<string, boolean> = {};

  // First, initialize all spaces to false so they're properly registered
  if (spaces) {
    for (const space of spaces) {
      if (space.kind === "regular" || space.kind === "global") {
        sharingSettings[space.sId] = false;
      }
    }
  }

  // Then set the enabled ones to true
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

  const defaults: MCPServerFormValues = {
    name: view.name ?? view.server.name,
    description: getMcpServerViewDescription(view),
    toolSettings,
    sharingSettings,
  };

  if (supportsBearerToken) {
    defaults.sharedSecret = view.server.sharedSecret ?? "";
    defaults.customHeaders = Object.entries(
      view.server.customHeaders ?? {}
    ).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }

  if (isRemoteMCPServerType(view.server)) {
    defaults.icon = view.server.icon;
  }

  return defaults;
}

export function getMCPServerFormSchema(view: MCPServerViewType) {
  const supportsBearerToken = supportsBearerTokenConfiguration(view.server);
  let schema = z.object({
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
    schema = schema.extend({
      icon: z.string().optional(),
    });
  }

  if (supportsBearerToken) {
    schema = schema.extend({
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

  return schema;
}

type FormDiffType = {
  serverView?: { name: string; description: string };
  icon?: string;
  authSharedSecret?: string;
  authCustomHeaders?: HeaderRow[] | null;
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
  {
    isRemote,
    supportsBearerToken,
  }: {
    isRemote: boolean;
    supportsBearerToken: boolean;
  }
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
      out.icon = current.icon;
    }
  }

  if (supportsBearerToken) {
    if (
      typeof current.sharedSecret === "string" &&
      current.sharedSecret !== initial.sharedSecret &&
      current.sharedSecret.length > 0
    ) {
      out.authSharedSecret = current.sharedSecret;
    }

    const iSan = sanitizeHeadersArray(initial.customHeaders ?? []);
    const cSan = sanitizeHeadersArray(current.customHeaders ?? []);
    if (JSON.stringify(iSan) !== JSON.stringify(cSan)) {
      out.authCustomHeaders = cSan.length > 0 ? cSan : null;
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
