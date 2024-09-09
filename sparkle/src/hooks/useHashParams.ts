/**
 * Original code from : https://www.npmjs.com/package/use-hash-param
 * ISC License
 */

import { useCallback, useEffect, useState } from "react";

const getHashSearchParams = (location: Location): [string, URLSearchParams] => {
  const hash = location.hash.slice(1);
  const [prefix, query] = hash.split("?");

  return [prefix, new URLSearchParams(query)];
};

const getHashParam = (key: string, defaultValue?: string) => {
  if (typeof window === "undefined") {
    return defaultValue;
  }

  const [, searchParams] = getHashSearchParams(window.location);

  return searchParams.get(key) ?? defaultValue;
};

const setHashParam = (
  key: string,
  value: string | undefined,
  shouldReplaceState: boolean
) => {
  if (typeof window !== "undefined") {
    const [prefix, searchParams] = getHashSearchParams(window.location);

    if (typeof value === "undefined" || value === "") {
      searchParams.delete(key);
    } else {
      searchParams.set(key, value);
    }

    const search = searchParams.toString();
    const hash = search ? `${prefix}?${search}` : prefix;
    if (shouldReplaceState && "replaceState" in history) {
      history.replaceState(null, "", `#${hash}`);
    } else {
      window.location.hash = hash;
    }
  }
};

type Updater = (prevValue?: string) => string;

export type HistoryOptions = "replace" | "push";

type SetterOptions = {
  history: HistoryOptions;
};
type Setter = (value?: string | Updater, options?: SetterOptions) => void;

/**
 * @param key The parameter-name to use from the hash-string query string.
 * @param defaultValue A default value to use if the parameter is not specified and on the server.
 * @returns A two-tuple, the first element is the selected param value (either extracted from the hash param or the default value).
 *  The second element is a setter function to change the param value.
 */

export const useHashParam = (
  key: string,
  defaultValue?: string
): [string | undefined, Setter] => {
  const [innerValue, setInnerValue] = useState<string | undefined>(() =>
    getHashParam(key, defaultValue)
  );

  useEffect(() => {
    const handleHashChange = () =>
      setInnerValue(getHashParam(key, defaultValue));
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [key]);

  const setValue = useCallback<Setter>(
    (
      newValue?: string | Updater,
      options: SetterOptions = { history: "replace" }
    ) => {
      const newInnerValue =
        typeof newValue === "function"
          ? newValue(getHashParam(key, defaultValue))
          : newValue;

      setInnerValue(newInnerValue);
      setHashParam(key, newInnerValue, options.history === "replace");
    },
    [key]
  );

  return [innerValue || defaultValue, setValue];
};
