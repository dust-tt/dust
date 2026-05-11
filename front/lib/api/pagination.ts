// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { NextApiRequest } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

class InvalidPaginationParamsError extends Error {
  constructor(
    message: string,
    readonly reason: string
  ) {
    super(message);
  }
}

export interface PaginationParams {
  orderColumn: string;
  orderDirection: "asc" | "desc";
  lastValue?: any;
  limit: number;
}

function getOrderColumnSchema(
  supportedOrderColumns: string[]
): z.ZodType<string> {
  const [first, ...rest] = supportedOrderColumns;
  if (supportedOrderColumns.length === 1) {
    return z.literal(first);
  }

  return z.enum([first, ...rest] as [string, ...string[]]);
}

const DEFAULT_MAX_LIMIT = 2000;

const PaginationParamsSchema = (
  supportedOrderColumns: string[],
  maxLimit: number
) =>
  z.object({
    orderColumn: getOrderColumnSchema(supportedOrderColumns),
    orderDirection: z.enum(["asc", "desc"]),
    lastValue: z.string().optional(),
    limit: z.number().min(0).max(maxLimit),
  });

interface PaginationOptions {
  defaultLimit: number;
  defaultOrderColumn: string;
  defaultOrderDirection: "asc" | "desc";
  supportedOrderColumn: string[];
  maxLimit?: number;
}

export function getPaginationParams(
  req: NextApiRequest,
  defaults: PaginationOptions
): Result<PaginationParams, InvalidPaginationParamsError> {
  const rawParams = {
    // Don't support a default order column.
    orderColumn: req.query.orderColumn ?? defaults.defaultOrderColumn,
    orderDirection: req.query.orderDirection ?? defaults.defaultOrderDirection,
    lastValue: req.query.lastValue,
    limit: req.query.limit
      ? parseInt(req.query.limit as string)
      : defaults.defaultLimit,
  };

  const queryValidation = PaginationParamsSchema(
    defaults.supportedOrderColumn,
    defaults.maxLimit ?? DEFAULT_MAX_LIMIT
  ).safeParse(rawParams);

  // Validate and decode the raw parameters.
  if (!queryValidation.success) {
    return new Err(
      new InvalidPaginationParamsError(
        "Invalid pagination parameters",
        fromError(queryValidation.error).toString()
      )
    );
  }

  return new Ok(queryValidation.data);
}

export const SortingParamsCodec = z.array(
  z.object({
    field: z.string(),
    direction: z.enum(["asc", "desc"]),
  })
);

export type SortingParams = z.infer<typeof SortingParamsCodec>;

// Cursor pagination.

const CursorPaginationParamsSchema = z.object({
  limit: z.number().min(0).max(DEFAULT_MAX_LIMIT),
  cursor: z.string().nullable(),
});

export interface CursorPaginationParams {
  limit: number;
  cursor: string | null;
}

export function getCursorPaginationParams(
  req: NextApiRequest
): Result<CursorPaginationParams | undefined, InvalidPaginationParamsError> {
  if (!req.query.limit) {
    return new Ok(undefined);
  }

  const rawParams = {
    cursor: req.query.cursor ?? null,
    limit: parseInt(req.query.limit as string, 10),
  };

  const queryValidation = CursorPaginationParamsSchema.safeParse(rawParams);

  // Validate and decode the raw parameters.
  if (!queryValidation.success) {
    return new Err(
      new InvalidPaginationParamsError(
        "Invalid pagination parameters",
        fromError(queryValidation.error).toString()
      )
    );
  }

  return new Ok(queryValidation.data);
}
