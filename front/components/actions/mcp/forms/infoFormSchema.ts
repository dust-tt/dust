import { z } from "zod";

import {
  getMcpServerViewDescription,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { HeaderRow } from "@app/types";
import { sanitizeHeadersArray } from "@app/types";

import type { ServerSettings } from "./mcpServerFormSchema";

export type InfoFormValues = ServerSettings;

export function getInfoFormDefaults(view: MCPServerViewType): InfoFormValues {
  const baseDefaultValues = {
    name: view.name ?? view.server.name,
    description: getMcpServerViewDescription(view),
  };
  if (isRemoteMCPServerType(view.server)) {
    return {
      ...baseDefaultValues,
      icon: view.server.icon,
      sharedSecret: view.server.sharedSecret ?? "",
      customHeaders: Object.entries(view.server.customHeaders ?? {}).map(
        ([key, value]) => ({
          key,
          value: String(value),
        })
      ),
    };
  }
  return baseDefaultValues;
}

export function getInfoFormSchema(view: MCPServerViewType) {
  const baseSchema = z.object({
    name: z.string().min(1, "Name is required."),
    description: z.string().min(1, "Description is required."),
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

type InfoFormDiffType = {
  serverView?: { name: string; description: string };
  remoteIcon?: string;
  remoteSharedSecret?: string;
  remoteCustomHeaders?: HeaderRow[] | null;
};

export function diffInfoForm(
  initial: InfoFormValues,
  current: InfoFormValues,
  isRemote: boolean
): InfoFormDiffType {
  const out: InfoFormDiffType = {};
  if (
    current.name !== initial.name ||
    current.description !== initial.description
  ) {
    out.serverView = {
      name: current.name,
      description: current.description,
    };
  }

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

    // Compare sanitized custom headers
    const iSan = sanitizeHeadersArray(initial.customHeaders ?? []);
    const cSan = sanitizeHeadersArray(current.customHeaders ?? []);
    if (JSON.stringify(iSan) !== JSON.stringify(cSan)) {
      out.remoteCustomHeaders = cSan.length > 0 ? cSan : null;
    }
  }

  return out;
}
