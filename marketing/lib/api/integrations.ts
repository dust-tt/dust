import type { IntegrationBase } from "@marketing/components/home/content/Integration/types";
import config from "@marketing/lib/api/config";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const integrationToolSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  isWriteAction: z.boolean(),
});

const integrationBaseSchema = z.object({
  slug: z.string(),
  name: z.string(),
  type: z.enum(["mcp_server", "connector", "both"]),
  description: z.string(),
  // Icon is a plain string at the wire boundary — front may ship platform
  // logos that this app's bundled Sparkle doesn't know about yet. The
  // renderer resolves it via Sparkle's `getPlatformLogo` with a fallback.
  icon: z.string(),
  documentationUrl: z.string().nullable(),
  authorizationRequired: z.boolean(),
  tools: z.array(integrationToolSchema),
  category: z.enum([
    "communication",
    "productivity",
    "crm",
    "development",
    "data",
    "email",
    "calendar",
    "storage",
    "support",
    "security",
    "ai",
    "transcripts",
    "recruiting",
  ]),
  connectorDescription: z.string().optional(),
  connectorGuideUrl: z.string().nullable().optional(),
});

const integrationsResponseSchema = z.object({
  integrations: z.array(integrationBaseSchema),
});

export async function fetchPublicIntegrations(): Promise<IntegrationBase[]> {
  const res = await fetch(
    `${config.getApiBaseUrl()}/api/marketing/integrations`
  );

  if (!res.ok) {
    throw new Error(
      `Failed to fetch marketing integrations: ${res.status} ${res.statusText}`
    );
  }

  const parsed = integrationsResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(
      `Invalid marketing integrations response: ${fromError(parsed.error)}`
    );
  }

  return parsed.data.integrations;
}
