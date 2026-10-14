import { z } from "zod";

export const EDGEE_CONSOLE_API_URL = "https://api.edgee.app";

// Stored in the OAuth service under the `edgee` provider, one per workspace.
export const EdgeeAdminCredentialsSchema = z.object({
  // Edgee personal access token of the workspace admin, used for the Console API only.
  api_key: z.string(),
  organization_id: z.string(),
});
export type EdgeeAdminCredentials = z.infer<typeof EdgeeAdminCredentialsSchema>;

// Stored in the OAuth service under the `edgee_gateway_key` provider, one per user.
export const EdgeeGatewayKeyCredentialsSchema = z.object({
  api_key: z.string(),
  api_key_id: z.string(),
});
export type EdgeeGatewayKeyCredentials = z.infer<
  typeof EdgeeGatewayKeyCredentialsSchema
>;

export const EdgeeConnectionBodySchema = z.object({
  adminToken: z.string().min(1),
  organizationId: z.string().min(1),
});
export type EdgeeConnectionBody = z.infer<typeof EdgeeConnectionBodySchema>;

export type EdgeeConnectionType = {
  organizationId: string;
  editedByUserId: number | null;
  updatedAt: number;
};

export type GetEdgeeConnectionResponseBody = {
  connection: EdgeeConnectionType | null;
};

export type PutEdgeeConnectionResponseBody = {
  connection: EdgeeConnectionType;
};
