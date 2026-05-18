import { Err } from "@app/types/shared/result";

/**
 * Returns an Err whose message is prefixed with `prefix:`. Use to attribute
 * a downstream error to a specific operation when propagating it up the
 * resolver call chain.
 *
 * Example:
 *   const cellResult = resolveTableCell(...);
 *   if (cellResult.isErr()) {
 *     return prefixErr("replaceTableCell", cellResult.error);
 *   }
 */
export function prefixErr(prefix: string, err: Error): Err<Error> {
  return new Err(new Error(`${prefix}: ${err.message}`));
}
