import { SnowflakeKeyPairCredentialsSchema } from "@app/types/oauth/lib";

export const SNOWFLAKE_INTERNAL_SERVER_CREDENTIAL_POLICY = {
  provider: "snowflake",
  validateContent: (content: unknown) =>
    SnowflakeKeyPairCredentialsSchema.safeParse(content).success,
  invalidContentMessage:
    "The credential provided must be a Snowflake key-pair credential.",
} as const;
