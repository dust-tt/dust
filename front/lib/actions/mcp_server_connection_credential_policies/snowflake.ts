import { SnowflakeKeyPairCredentialsSchema } from "@app/types/oauth/lib";
import { isLeft } from "fp-ts/lib/Either";

export const SNOWFLAKE_INTERNAL_SERVER_CREDENTIAL_POLICY = {
  provider: "snowflake",
  validateContent: (content: unknown) =>
    !isLeft(SnowflakeKeyPairCredentialsSchema.decode(content)),
  invalidContentMessage:
    "The credential provided must be a Snowflake key-pair credential.",
} as const;
