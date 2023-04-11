/**
 * A Result is a type that can be either Ok or Err.
 * The main motivation behind this utils is to overcome the fact that Javascript does not
 * let you check the type of an object at runtime, so you cannot know if a function returned an error type
 * or a success type.
 *
 * Usage:
 * import {Result, Ok, Err, isOk, isErr} from "@app/lib/result"
 * function divide(numerator: number, denominator: number) : Result<number, Error> {
 *     if (denominator === 0) {
 *        return new Err(new Error("Cannot divide by zero"));
 *      }
 *     return new Ok(numerator / denominator);
 * }
 */

export class Ok<T> {
  constructor(public value: T) {}

  isOk(): this is Ok<T> {
    return true;
  }

  isErr(): this is Err<never> {
    return false;
  }
}

export class Err<E> {
  constructor(public error: E) {}

  isOk(): this is Ok<never> {
    return false;
  }

  isErr(): this is Err<E> {
    return true;
  }
}

export type Result<T, E> = Ok<T> | Err<E>;
