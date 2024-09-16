import type { Result } from "@dust-tt/types";
import { createRangeCodec, Err, Ok } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest } from "next";

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

const LimitCodec = createRangeCodec(0, 500);

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

// Offset pagination.

const OffsetPaginationParamsCodec = t.type({
  limit: LimitCodec,
  offset: t.number,
});

export interface OffsetPaginationParams {
  limit: number;
  offset: number;
}

interface OffsetPaginationOptions {
  defaultLimit: number;
  defaultOffset: 0;
}

export function getOffsetPaginationParams(
  req: NextApiRequest,
  defaults: OffsetPaginationOptions
): Result<OffsetPaginationParams, InvalidPaginationParamsError> {
  const rawParams = {
    limit: req.query.limit
      ? parseInt(req.query.limit as string)
      : defaults.defaultLimit,
    offset: req.query.offset
      ? parseInt(req.query.offset as string)
      : defaults.defaultOffset,
  };

  const queryValidation = OffsetPaginationParamsCodec.decode(rawParams);

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
