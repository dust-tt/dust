import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

type ParamValue = {
  value: string | undefined;
  setParam: (newValue: string | undefined) => void;
};

type UseQueryParamsResult<T extends string[]> = {
  [K in T[number]]: ParamValue;
} & {
  setParams: (updates: Partial<Record<T[number], string | undefined>>) => void;
};

export function useQueryParams<T extends string[]>(
  paramNames: T
): UseQueryParamsResult<T> {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (router.isReady) {
      const newValues = paramNames.reduce<Record<string, string | undefined>>(
        (acc, name) => {
          const value = router.query[name];
          acc[name] = typeof value === "string" ? value : undefined;
          return acc;
        },
        {}
      );

      if (JSON.stringify(newValues) !== JSON.stringify(values)) {
        setValues(newValues);
      }
    }
  }, [router.isReady, paramNames, router.query, values]);

  const setParams = useCallback(
    (updates: Partial<Record<T[number], string | undefined>>) => {
      const initialQuery = { ...router.query };

      const [updatedQuery, hasChanges] = Object.entries(updates).reduce<
        [Record<string, string | undefined | string[]>, boolean]
      >(
        ([currentQuery, changed], [paramName, newValue]) => {
          // Skip if not in our param list
          if (!paramNames.includes(paramName)) {
            return [currentQuery, changed];
          }

          const currentValue = currentQuery[paramName];

          // Skip if value hasn't changed
          if (currentValue === newValue) {
            return [currentQuery, changed];
          }

          if (typeof newValue === "string") {
            // Add or update param with string value
            return [{ ...currentQuery, [paramName]: newValue }, true];
          } else {
            // Remove param when value is undefined
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [paramName]: _, ...restQuery } = currentQuery;
            return [restQuery, true];
          }
        },
        [initialQuery, false]
      );

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

  const getters = useMemo(() => {
    return paramNames.reduce(
      (acc, paramName) => {
        acc[paramName as T[number]] = {
          value: values[paramName],
          setParam: (newValue: string | undefined) =>
            setParams({
              [paramName]: newValue,
            } as Partial<Record<T[number], string | undefined>>),
        };
        return acc;
      },
      {} as Record<T[number], ParamValue>
    );
  }, [paramNames, values, setParams]);

  return {
    ...getters,
    setParams,
  };
}
