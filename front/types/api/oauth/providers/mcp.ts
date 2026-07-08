import { z } from "zod";

export const BaseMCPMetadataSchema = z.object({
  client_id: z.string(),
  token_endpoint: z.string(),
  authorization_endpoint: z.string(),
});

export const MCPOAuthConnectionMetadataSchema = BaseMCPMetadataSchema.extend({
  client_secret: z.string().optional(),
  scope: z.string().optional(),
  resource: z.string().optional(),
  token_endpoint_auth_method: z.string().optional(),
});

export type MCPOAuthConnectionMetadataType = z.infer<
  typeof MCPOAuthConnectionMetadataSchema
>;

export type DiscoverOAuthMetadataResponseBody =
  | {
      oauthRequired: true;
      connectionMetadata: MCPOAuthConnectionMetadataType;
    }
  | {
      oauthRequired: false;
    };
