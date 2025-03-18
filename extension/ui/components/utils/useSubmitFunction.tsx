import { useCallback, useState } from "react";

export function useSubmitFunction<T extends unknown[]>(
  submitFn: (...data: T) => Promise<void>
) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (...data: T) => {
      if (isSubmitting) {
        return;
      }

      setIsSubmitting(true);

      try {
        await submitFn(...data);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, submitFn]
  );

  return { submit, isSubmitting };
}
