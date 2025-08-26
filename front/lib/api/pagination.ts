import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest } from "next";

import type { Result } from "@app/types";
import { createRangeCodec, Err, Ok } from "@app/types";

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

function getOrderColumnCodec(supportedOrderColumns: string[]): t.Mixed {
  const [first, second, ...rest] = supportedOrderColumns;
  if (supportedOrderColumns.length === 1) {
    return t.literal(first);
  }

  return t.union([
    t.literal(first),
    t.literal(second),
    ...rest.map((value) => t.literal(value)),
  ]);
}

const LimitCodec = createRangeCodec(0, 2000);

const PaginationParamsCodec = (supportedOrderColumns: string[]) =>
  t.type({
    orderColumn: getOrderColumnCodec(supportedOrderColumns),
    orderDirection: t.union([t.literal("asc"), t.literal("desc")]),
    lastValue: t.union([t.string, t.undefined]),
    limit: LimitCodec,
  });

interface PaginationOptions {
  defaultLimit: number;
  defaultOrderColumn: string;
  defaultOrderDirection: "asc" | "desc";
  supportedOrderColumn: string[];
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

  const queryValidation = PaginationParamsCodec(
    defaults.supportedOrderColumn
  ).decode(rawParams);

  // Validate and decode the raw parameters.
  if (isLeft(queryValidation)) {
    const pathError = reporter.formatValidationErrors(queryValidation.left);

    return new Err(
      new InvalidPaginationParamsError(
        "Invalid pagination parameters",
        pathError.join(",")
      )
    );
  }

  return new Ok(queryValidation.right);
}

export const SortingParamsCodec = t.array(
  t.type({
    field: t.string,
    direction: t.union([t.literal("asc"), t.literal("desc")]),
  })
);

export type SortingParams = t.TypeOf<typeof SortingParamsCodec>;

// Cursor pagination.

const CursorPaginationParamsCodec = t.type({
  limit: LimitCodec,
  cursor: t.union([t.string, t.null]),
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

  const queryValidation = CursorPaginationParamsCodec.decode(rawParams);

  // Validate and decode the raw parameters.
  if (isLeft(queryValidation)) {
    const pathError = reporter.formatValidationErrors(queryValidation.left);

    return new Err(
      new InvalidPaginationParamsError(
        "Invalid pagination parameters",
        pathError.join(",")
      )
    );
  }

  return new Ok(queryValidation.right);
}
