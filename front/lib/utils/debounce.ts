const DEBOUNCE_DELAY = 1500;

/**
 * Debounce function to prevent too many calls
 * @param debounceHandle react ref to store the timeout handle (to clear it)
 * @param func function to call after the debounce delay
 */
export function debounce(
  debounceHandle: React.MutableRefObject<NodeJS.Timeout | undefined>,
  func: () => void
) {
  if (debounceHandle.current) {
    clearTimeout(debounceHandle.current);
    debounceHandle.current = undefined;
  }
  debounceHandle.current = setTimeout(func, DEBOUNCE_DELAY);
}
