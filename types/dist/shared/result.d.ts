/**
 * A Result is a type that can be either Ok or Err.
 * The main motivation behind this utils is to overcome the fact that Javascript does not
 * let you check the type of an object at runtime, so you cannot know if a function returned an error type
 * or a success type.
 *
 * Usage:
 * import {Result, Ok, Err} from "@app/lib/result"
 * function divide(numerator: number, denominator: number) : Result<number, Error> {
 *     if (denominator === 0) {
 *        return new Err(new Error("Cannot divide by zero"));
 *      }
 *     return new Ok(numerator / denominator);
 * }
 */
export declare class Ok<T> {
    value: T;
    constructor(value: T);
    isOk(): this is Ok<T>;
    isErr(): this is Err<never>;
}
export declare class Err<E> {
    error: E;
    constructor(error: E);
    isOk(): this is Ok<never>;
    isErr(): this is Err<E>;
}
export type Result<T, E> = Ok<T> | Err<E>;
//# sourceMappingURL=result.d.ts.map