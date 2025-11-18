import { z } from "zod";

import {
  getMcpServerViewDescription,
  isRemoteMCPServerType,
  supportsBearerTokenConfiguration,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { HeaderRow } from "@app/types";
import { sanitizeHeadersArray } from "@app/types";

import type { ServerSettings } from "./mcpServerFormSchema";

export type InfoFormValues = ServerSettings;

export function getInfoFormDefaults(view: MCPServerViewType): InfoFormValues {
  const baseDefaultValues: InfoFormValues = {
    name: view.name ?? view.server.name,
    description: getMcpServerViewDescription(view),
  };
  const supportsBearerToken = supportsBearerTokenConfiguration(view.server);
  if (isRemoteMCPServerType(view.server)) {
    baseDefaultValues.icon = view.server.icon;
  }
  if (supportsBearerToken) {
    baseDefaultValues.sharedSecret = view.server.sharedSecret ?? "";
    baseDefaultValues.customHeaders = Object.entries(
      view.server.customHeaders ?? {}
    ).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  }
  return baseDefaultValues;
}

export function getInfoFormSchema(view: MCPServerViewType) {
  const supportsBearerToken = supportsBearerTokenConfiguration(view.server);
  let schema = z.object({
    name: z.string().min(1, "Name is required."),
    description: z.string().min(1, "Description is required."),
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

type InfoFormDiffType = {
  serverView?: { name: string; description: string };
  icon?: string;
  authSharedSecret?: string;
  authCustomHeaders?: HeaderRow[] | null;
};

export function diffInfoForm(
  initial: InfoFormValues,
  current: InfoFormValues,
  {
    isRemote,
    supportsBearerToken,
  }: {
    isRemote: boolean;
    supportsBearerToken: boolean;
  }
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

    // Compare sanitized custom headers
    const iSan = sanitizeHeadersArray(initial.customHeaders ?? []);
    const cSan = sanitizeHeadersArray(current.customHeaders ?? []);
    if (JSON.stringify(iSan) !== JSON.stringify(cSan)) {
      out.authCustomHeaders = cSan.length > 0 ? cSan : null;
    }
  }

  return out;
}
