import type { z } from "zod";

export type CacheOperationParam = {
  key: string;
  label: string;
  type: "string" | "number";
  placeholder: string;
};

export type CacheOperationDescription = {
  id: string;
  label: string;
  params: CacheOperationParam[];
  supportsBulkInvalidation: boolean;
};

export type CacheOperations = {
  description: CacheOperationDescription;
  buildKey: (params: Record<string, string>) => string;
  keyPattern: string | null;
};

export function defineCacheOperations<Input>({
  id,
  label,
  params,
  inputSchema,
  buildKey,
  keyPattern,
}: {
  id: string;
  label: string;
  params: CacheOperationParam[];
  inputSchema: z.ZodType<Input>;
  buildKey: (input: Input) => string;
  keyPattern: string | null;
}): CacheOperations {
  return {
    description: {
      id,
      label,
      params,
      supportsBulkInvalidation: keyPattern !== null,
    },
    buildKey: (rawParams) => buildKey(inputSchema.parse(rawParams)),
    keyPattern,
  };
}
