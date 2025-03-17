import * as O from 'fp-ts/Option';
import * as t from 'io-ts';
import { Reporter } from 'io-ts/lib/Reporter';
/**
 * @category internals
 * @since 1.2.1
 */
export declare const TYPE_MAX_LEN = 160;
/**
 * Format a single validation error.
 *
 * @category formatters
 * @since 1.0.0
 */
export declare const formatValidationError: (error: t.ValidationError, options?: ReporterOptions | undefined) => O.Option<string>;
/**
 * Format validation errors (`t.Errors`).
 *
 * @example
 * import * as E from 'fp-ts/Either'
 * import * as t from 'io-ts'
 * import { formatValidationErrors } from 'io-ts-reporters'
 *
 * const result = t.string.decode(123)
 *
 * assert.deepEqual(
 *   E.mapLeft(formatValidationErrors)(result),
 *   E.left(['Expecting string but instead got: 123'])
 * )
 *
 * @category formatters
 * @since 1.2.0
 */
export declare const formatValidationErrors: (errors: t.Errors, options?: ReporterOptions | undefined) => string[];
/**
 * @category formatters
 * @since 1.2.2
 */
export interface ReporterOptions {
    truncateLongTypes?: boolean;
}
/**
 * Deprecated, use the default export instead.
 *
 * @category deprecated
 * @deprecated
 * @since 1.0.0
 */
export declare const reporter: <T>(validation: t.Validation<T>, options?: ReporterOptions | undefined) => string[];
interface PrettyReporter extends Reporter<string[]> {
    report: <T>(validation: t.Validation<T>, options?: ReporterOptions) => string[];
}
declare const prettyReporter: PrettyReporter;
export default prettyReporter;
