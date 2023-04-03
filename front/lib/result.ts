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
 *        return Err(new Error("Cannot divide by zero"));
 *      }
 *     return Ok(numerator / denominator);
 * }
 */

export class Result<T, E> {
  private _value?: T;
  private _error?: E;

  constructor(value?: T, error?: E) {
    if (value && error) {
      throw new Error("Cannot create a Result with both a value and an error");
    }
    if (!value && !error) {
      throw new Error(
        "Cannot create a Result with neither a value nor an error"
      );
    }
    if (value) {
      this._value = value;
    } else {
      this._error = error;
    }
  }

  isOk(): boolean {
    return !!this._value;
  }

  isErr(): boolean {
    return !!this._error;
  }

  value(): T {
    if (!this._value) {
      throw new Error("Cannot get value of an Err Result");
    }
    return this._value;
  }

  error(): E {
    if (!this._error) {
      throw new Error("Cannot get error of an Ok Result");
    }
    return this._error;
  }
}

export function Ok<T, E>(value: T) {
  return new Result<T, E>(value);
}

export function Err<T, E>(error: E): Result<T, E> {
  return new Result<T, E>(undefined, error);
}
