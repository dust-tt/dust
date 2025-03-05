import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

type ParamValue = {
  value: string | undefined;
  setParam: (newValue: string | undefined) => void;
};

type UseQueryParamsResult<T extends string> = {
  [K in T]: ParamValue;
} & {
  setParams: (updates: Partial<Record<T, string | undefined>>) => void;
};

export function useQueryParams<T extends string>(
  paramNames: T[]
): UseQueryParamsResult<T> {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (router.isReady) {
      const newValues = paramNames.reduce(
        (acc, name) => {
          acc[name] = router.query[name] as string | undefined;
          return acc;
        },
        {} as Record<string, string | undefined>
      );

      // Only update state if values actually changed
      if (JSON.stringify(newValues) !== JSON.stringify(values)) {
        setValues(newValues);
      }
    }
  }, [router.isReady, paramNames, router.query, values]);

  // Multi-parameter update function
  const setParams = useCallback(
    (updates: Partial<Record<T, string | undefined>>) => {
      const updatedQuery = { ...router.query };
      let hasChanges = false;

      // Process all updates at once
      Object.entries(updates).forEach(([paramName, newValue]) => {
        if (paramNames.includes(paramName as T)) {
          const currentValue = router.query[paramName] as string | undefined;

          // Only update if value actually changed
          if (currentValue !== newValue) {
            hasChanges = true;
            if (typeof newValue === "string") {
              updatedQuery[paramName] = newValue;
            } else {
              delete updatedQuery[paramName];
            }
          }
        }
      });

      // Only push router update if something actually changed
      if (hasChanges) {
        void router.push(
          { pathname: router.pathname, query: updatedQuery },
          undefined,
          { shallow: true }
        );
      }
    },
    [router, paramNames]
  );

  const getters = useMemo(
    () =>
      paramNames.reduce(
        (acc, paramName) => ({
          ...acc,
          [paramName]: {
            value: values[paramName],
            setParam: (newValue: string | undefined) =>
              setParams({ [paramName]: newValue } as Partial<
                Record<T, string | undefined>
              >),
          },
        }),
        {} as Record<T, ParamValue>
      ),
    [paramNames, values, setParams]
  );

  return {
    ...getters,
    setParams,
  } as UseQueryParamsResult<T>;
}
