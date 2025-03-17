/**
 * @since 1.1.0
 */
import { Predicate } from 'fp-ts/function';
/**
 * @since 1.1.0
 */
export declare const takeUntil: <A = unknown>(predicate: Predicate<A>) => (as: readonly A[]) => readonly A[];
