/**
 * Original code from : https://www.npmjs.com/package/use-hash-param
 * ISC License
 */

import { useCallback, useEffect, useState } from "react";

const getUrlFromLocation = (location: Location) => {
  return `${location.pathname}${location.search}${location.hash}`;
};

const getHashFromUrl = (url: string) => {
  const urlObj = new URL(url, "https://example.com");
  return urlObj.hash.slice(1);
};

const getHashSearchParams = (url: string): [string, URLSearchParams] => {
  const hash = getHashFromUrl(url);
  const [prefix, query] = hash.split("?");

  return [prefix, new URLSearchParams(query)];
};

const getHashParam = (url: string, key: string, defaultValue?: string) => {
  const [, searchParams] = getHashSearchParams(url);
  return searchParams.get(key) ?? defaultValue;
};

type Updater = (prevValue?: string) => string;

export type HistoryOptions = "replace" | "push";

type SetterOptions = {
  history: HistoryOptions;
};
type Setter = (value?: string | Updater, options?: SetterOptions) => void;

const DEFAULT_OPTIONS: SetterOptions = { history: "replace" };

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
  // Hold the internal value for the search param defined by "key" in the hash.
  const [innerValue, setInnerValue] = useState<{
    val: string | undefined;
    options: SetterOptions;
  }>({
    val:
      typeof window !== "undefined"
        ? getHashParam(getUrlFromLocation(window.location), key, defaultValue)
        : defaultValue,
    options: DEFAULT_OPTIONS,
  });

  // Listen to hash/popstate changes and sync the internal value.
  useEffect(() => {
    const onHashChange = () => {
      const hash = getHashFromUrl(getUrlFromLocation(window.location));
      if (!hash) {
        setInnerValue((prev) =>
          prev.val !== undefined
            ? { val: undefined, options: DEFAULT_OPTIONS }
            : prev
        );
      } else {
        const newVal = getHashParam(
          getUrlFromLocation(window.location),
          key,
          defaultValue
        );
        setInnerValue((prev) =>
          prev.val !== newVal ? { val: newVal, options: DEFAULT_OPTIONS } : prev
        );
      }
    };

    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, [key, defaultValue]);

  // Listen to innerValue changes and update the hash in the URL if there is a mismatch.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Get current hash from window.location, DO NOT DEFAULT TO DEFAULT VALUE.
    const currentHash = getHashParam(getUrlFromLocation(window.location), key);
    if (currentHash !== innerValue.val) {
      const { pathname, search } = window.location;
      const [prefix, searchParams] = getHashSearchParams(
        getUrlFromLocation(window.location)
      );

      if (typeof innerValue.val === "undefined" || innerValue.val === "") {
        searchParams.delete(key);
      } else {
        searchParams.set(key, innerValue.val);
      }

      const hashSearch = searchParams.toString();
      const hash = hashSearch ? `${prefix}?${hashSearch}` : prefix;
      const newUrl = `${pathname}${search}${hash ? `#${hash}` : ""}`;

      if (innerValue.options.history === "replace") {
        window.history.replaceState(window.history.state, "", newUrl);
      } else {
        window.history.pushState(window.history.state, "", newUrl);
      }

      // pushState/replaceState don't fire hashchange, so notify other
      // useHashParam instances manually.
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, [innerValue, key]);

  const setValue = useCallback<Setter>(
    (newValue?: string | Updater, options: SetterOptions = DEFAULT_OPTIONS) => {
      const newInnerValue =
        typeof newValue === "function"
          ? newValue(
              getHashParam(
                getUrlFromLocation(window.location),
                key,
                defaultValue
              )
            )
          : newValue;

      setInnerValue({ val: newInnerValue, options });
    },
    [defaultValue, key]
  );

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return [innerValue.val || defaultValue, setValue];
};
