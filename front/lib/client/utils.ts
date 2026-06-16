import { useCallback, useState } from "react";

export function useSubmitFunction<T extends unknown[], R = void>(
  submitFn: (...data: T) => Promise<R>
) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (...data: T): Promise<R | undefined> => {
      if (isSubmitting) {
        return undefined;
      }

      setIsSubmitting(true);

      try {
        return await submitFn(...data);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, submitFn]
  );

  return { submit, isSubmitting };
}
