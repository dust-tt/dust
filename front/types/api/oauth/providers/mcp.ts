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
  // The finalize URI the client was registered with. Absent on connections
  // created before it was recorded, which marks their client as unverifiable.
  redirect_uri: z.string().optional(),
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
