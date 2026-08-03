import {
  BigQueryCredentialsWithLocationSchema,
  CheckBigQueryCredentialsSchema,
  NotionCredentialsSchema,
  SalesforceCredentialsSchema,
  SnowflakeCredentialsSchema,
} from "@app/types/oauth/lib";
import { z } from "zod";

const PostSnowflakeCredentialsBodySchema = z.object({
  provider: z.literal("snowflake"),
  credentials: SnowflakeCredentialsSchema,
});

const PostBigQueryCredentialsBodySchema = z.object({
  provider: z.literal("bigquery"),
  credentials: BigQueryCredentialsWithLocationSchema,
});

const PostSalesforceCredentialsBodySchema = z.object({
  provider: z.literal("salesforce"),
  credentials: SalesforceCredentialsSchema,
});

const PostNotionCredentialsBodySchema = z.object({
  provider: z.literal("notion"),
  credentials: NotionCredentialsSchema,
});

export const PostCredentialsBodySchema = z.union([
  PostSnowflakeCredentialsBodySchema,
  PostBigQueryCredentialsBodySchema,
  PostSalesforceCredentialsBodySchema,
  PostNotionCredentialsBodySchema,
]);

export type PostCredentialsBody = z.infer<typeof PostCredentialsBodySchema>;
export type PostCredentialsResponseBody = {
  credentials: {
    id: string;
  };
};

export const PostCheckBigQueryRegionsRequestBodySchema = z.object({
  credentials: CheckBigQueryCredentialsSchema,
});

export type PostCheckBigQueryLocationsResponseBody = {
  locations: Record<string, string[]>;
};

export interface GetOAuthSetupResponseBody {
  redirectUrl: string;
}
