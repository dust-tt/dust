import { z } from "zod";

export const acceptableTranscriptProvidersCodec = z.enum([
  "google_drive",
  "modjo",
]);

export const acceptableTranscriptsWithConnectorProvidersCodec =
  z.literal("gong");

const OAuthConfigSchema = z.object({
  provider: acceptableTranscriptProvidersCodec,
  connectionId: z.string(),
});

const ApiKeyConfigSchema = z.object({
  provider: acceptableTranscriptProvidersCodec,
  apiKey: z.string(),
});

const ConnectorConnectionConfigSchema = z.object({
  provider: acceptableTranscriptsWithConnectorProvidersCodec,
  useConnectorConnection: z.boolean(),
});

export const PostLabsTranscriptsConfigurationBodySchema = z.union([
  OAuthConfigSchema,
  ApiKeyConfigSchema,
  ConnectorConnectionConfigSchema,
]);

export type PostLabsTranscriptsConfigurationBody = z.infer<
  typeof PostLabsTranscriptsConfigurationBodySchema
>;

export function isApiKeyConfig(
  body: PostLabsTranscriptsConfigurationBody
): body is z.infer<typeof ApiKeyConfigSchema> {
  return "apiKey" in body;
}

export function isConnectorConnectionConfig(
  body: PostLabsTranscriptsConfigurationBody
): body is z.infer<typeof ConnectorConnectionConfigSchema> {
  return "useConnectorConnection" in body;
}

export function getConnectionDetails(
  body: PostLabsTranscriptsConfigurationBody
) {
  if (isConnectorConnectionConfig(body)) {
    return { oAuthConnectionId: null, useConnectorConnection: true };
  }
  if (isApiKeyConfig(body)) {
    return {
      oAuthConnectionId: null,
      useConnectorConnection: false,
      apiKey: body.apiKey,
    };
  }
  return {
    oAuthConnectionId: body.connectionId,
    useConnectorConnection: false,
  };
}
