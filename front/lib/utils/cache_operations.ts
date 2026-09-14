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
  buildKeysToDelete: (params: Record<string, string>) => string[];
  keyPattern: string | null;
  keyPatternsToDelete: string[];
};

export function defineCacheOperations<Input>({
  id,
  label,
  params,
  inputSchema,
  buildKey,
  buildKeysToDelete,
  keyPattern,
  keyPatternsToDelete,
}: {
  id: string;
  label: string;
  params: CacheOperationParam[];
  inputSchema: z.ZodType<Input>;
  buildKey: (input: Input) => string;
  buildKeysToDelete?: (input: Input) => string[];
  keyPattern: string | null;
  keyPatternsToDelete?: string[];
}): CacheOperations {
  return {
    description: {
      id,
      label,
      params,
      supportsBulkInvalidation: keyPattern !== null,
    },
    buildKey: (rawParams) => buildKey(inputSchema.parse(rawParams)),
    buildKeysToDelete: (rawParams) => {
      const input = inputSchema.parse(rawParams);
      return buildKeysToDelete ? buildKeysToDelete(input) : [buildKey(input)];
    },
    keyPattern,
    keyPatternsToDelete:
      keyPatternsToDelete ?? (keyPattern === null ? [] : [keyPattern]),
  };
}
