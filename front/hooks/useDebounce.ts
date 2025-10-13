import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseDebounceOptions {
  delay?: number;
  minLength?: number;
}

export function useDebounce(
  initialValue: string,
  options: UseDebounceOptions = {}
) {
  const { delay = 300, minLength = 0 } = options;

  const [inputValue, setInputValue] = useState<string>(initialValue);
  const [debouncedValue, setDebouncedValue] = useState<string>(initialValue);
  const [isDebouncing, setIsDebouncing] = useState(false);

  // Create debounced function
  const debouncedUpdate = useRef(
    debounce((value: string) => {
      setDebouncedValue(value);
      setIsDebouncing(false);
    }, delay)
  ).current;

  // Update function
  const setValue = useCallback(
    (value: string) => {
      setInputValue(value);

      if (minLength > 0 && value.length < minLength) {
        setDebouncedValue("");
        setIsDebouncing(false);
        debouncedUpdate.cancel();
        return;
      }
      setIsDebouncing(true);
      debouncedUpdate(value);
    },
    [debouncedUpdate, minLength]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedUpdate.cancel();
    };
  }, [debouncedUpdate]);

  return {
    inputValue,
    debouncedValue,
    isDebouncing,
    setValue,
    flush: debouncedUpdate.flush,
    cancel: debouncedUpdate.cancel,
  };
}
