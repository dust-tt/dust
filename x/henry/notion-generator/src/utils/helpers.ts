/**
 * Utility to wait for a specified number of milliseconds
 * @param ms Milliseconds to wait
 * @returns Promise that resolves after the specified time
 */
export const wait = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
