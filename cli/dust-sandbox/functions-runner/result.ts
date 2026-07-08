// Minimal Result, mirroring front's @app/types/shared/result so both codebases read the same
// way. The runner cannot import front code (separate package and bundle), hence the local copy.

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
