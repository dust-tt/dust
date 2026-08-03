import type { DatasetType } from "@app/types/dataset";
import { z } from "zod";

export type GetDatasetsResponseBody = {
  datasets: DatasetType[];
};

export type PostDatasetResponseBody = {
  dataset: DatasetType;
};

export type GetDatasetResponseBody = { dataset: DatasetType };

export const PostDatasetRequestBodySchema = z.object({
  dataset: z.object({
    name: z.string(),
    description: z.string().nullable(),
    data: z.array(z.record(z.string(), z.any())),
  }),
  schema: z.array(
    z.object({
      key: z.string(),
      type: z.enum(["string", "number", "boolean", "json"]),
      description: z.string().nullable(),
    })
  ),
});
