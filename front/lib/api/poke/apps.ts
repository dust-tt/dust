import type { AppType, SpecificationType } from "@app/types/app";
import { z } from "zod";

export type PokeListApps = {
  apps: AppType[];
};

export type PokeGetAppDetails = {
  app: AppType;
  specification: SpecificationType;
  specificationHashes: string[] | null;
};

export const AppTypeSchema = z.object({
  sId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  savedSpecification: z.string().nullable(),
  savedConfig: z.string().nullable(),
  savedRun: z.string().nullable(),
  dustAPIProjectId: z.string(),
  datasets: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().nullable(),
        schema: z
          .array(
            z.object({
              type: z.enum(["string", "number", "boolean", "json"]),
              description: z.string().nullable(),
              key: z.string(),
            })
          )
          .nullish(),
        data: z.array(z.record(z.string(), z.any())).nullish(),
      })
    )
    .optional(),
  coreSpecifications: z.record(z.string(), z.string()).optional(),
});

export const ImportAppBody = z.object({
  app: AppTypeSchema,
});
