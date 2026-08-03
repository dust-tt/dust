// Contract types and schemas for the managed data source config endpoints.

import { z } from "zod";

export type GetOrPostManagedDataSourceConfigResponseBody = {
  configValue: string;
};

export const PostManagedDataSourceConfigRequestBodySchema = z.object({
  configValue: z.string(),
});
