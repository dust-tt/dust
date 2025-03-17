/**
 * @since 1.1.0
 */
import {Predicate} from 'fp-ts/function'

/**
 * @since 1.1.0
 */
/* eslint-disable @typescript-eslint/array-type */
export const takeUntil =
  <A = unknown>(predicate: Predicate<A>) =>
  (as: ReadonlyArray<A>): ReadonlyArray<A> => {
    const init = []

    // eslint-disable-next-line unicorn/no-for-loop
    for (let i = 0; i < as.length; i++) {
      init[i] = as[i]
      if (predicate(as[i])) {
        return init
      }
    }

    return init
  }
/* eslint-enable @typescript-eslint/array-type */
