import { z } from "zod";

import {
  getMcpServerViewDescription,
  isRemoteMCPServerType,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";

export type InfoFormValues = {
  name: string;
  description: string;
  icon?: string;
  sharedSecret?: string;
};

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
      icon: z.string().min(1, "Icon is required."),
      sharedSecret: z.string().optional(),
    });
  }
  return baseSchema;
}

type InfoFormDiffType = {
  serverView?: { name: string; description: string };
  remoteIcon?: string;
  remoteSharedSecret?: string;
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
  }

  return out;
}
