import { debounce } from "lodash";
import { useEffect, useRef, useState } from "react";

interface UseDebounceOptions {
  delay?: number;
  minLength?: number;
}

export function useDebounce<T>(
  initialValue: T,
  options: UseDebounceOptions = {}
) {
  const { delay = 300, minLength = 0 } = options;

  // Input value (immediate)
  const [inputValue, setInputValue] = useState<T>(initialValue);
  // Debounced value (delayed)
  const [debouncedValue, setDebouncedValue] = useState<T>(initialValue);
  // Loading state during debounce
  const [isDebouncing, setIsDebouncing] = useState(false);

  // Create debounced function
  const debouncedUpdate = useRef(
    debounce((value: T) => {
      setDebouncedValue(value);
      setIsDebouncing(false);
    }, delay)
  ).current;

  // Update function
  const setValue = (value: T) => {
    setInputValue(value);

    // String length check if applicable
    if (
      typeof value === "string" &&
      minLength > 0 &&
      value.length < minLength
    ) {
      setDebouncedValue("" as unknown as T);
      setIsDebouncing(false);
      debouncedUpdate.cancel();
      return;
    }

    setIsDebouncing(true);
    debouncedUpdate(value);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedUpdate.cancel();
    };
  }, [debouncedUpdate]);

  return {
    inputValue, // Immediate value (for UI)
    debouncedValue, // Delayed value (for operations)
    isDebouncing, // Loading state
    setValue, // Update function
    flush: debouncedUpdate.flush, // Force update immediately
    cancel: debouncedUpdate.cancel, // Cancel pending update
  };
}
