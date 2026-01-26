/**
 * Pushes an element to the start of the array, if found.
 */
export declare function pushToStart<T>(arr: T[], value: T): void;
/**
 * Pushes an element to the end of the array, if found.
 */
export declare function pushToEnd<T>(arr: T[], value: T): void;
/**
 * Returns an array containing an arithmetic progression.
 *
 * @param start Specifies the range’s initial value. The start is inclusive (included in the returned array)
 * @param stop The stop value is exclusive; it is not included in the result
 * @param step If step is positive, the last element is the largest start + i * step less than stop; if step is negative, the last element is the smallest start + i * step greater than stop
 */
export declare function range(start: number, stop: number, step?: number): number[];
//# sourceMappingURL=array.d.ts.map