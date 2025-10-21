/**
 * Original code from : https://www.npmjs.com/package/use-hash-param
 * ISC License
 */

import { useRouter } from "next/router";
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
  const router = useRouter();

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

  // Listen to hash change events and update the internal value if the hash is removed.
  useEffect(() => {
    const onEventComplete = (url: string) => {
      const hash = getHashFromUrl(url);
      // If there's no hash after route change, clear the content.
      if (!hash && innerValue) {
        setInnerValue({ val: undefined, options: DEFAULT_OPTIONS });
      }
    };

    router.events.on("hashChangeComplete", onEventComplete);
    router.events.on("routeChangeComplete", onEventComplete);
    return () => {
      router.events.off("hashChangeComplete", onEventComplete);
      router.events.off("routeChangeComplete", onEventComplete);
    };
  }, [router.events, innerValue, setInnerValue]);

  // Listen to innerValue changes and update the hash in the router if there is a mismatch.
  useEffect(() => {
    if (typeof window !== "undefined" && router.isReady) {
      // get current hash from window.location, DO NOT DEFAULT TO DEFAULT VALUE.
      const currentHash = getHashParam(
        getUrlFromLocation(window.location),
        key
      );
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
          void router
            .replace(newUrl, undefined, { shallow: true })
            .catch((e) => {
              // workaround for https://github.com/vercel/next.js/issues/37362
              if (!e.cancelled) {
                throw e;
              }
            });
        } else {
          void router.push(newUrl);
        }
      }
    }
    // Router object reference changes between renders, excluding it prevents unnecessary updates,
    // some of which cause an infinite rendering loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue, innerValue, key, router.isReady]);

  const setValue = useCallback<Setter>(
    async (
      newValue?: string | Updater,
      options: SetterOptions = DEFAULT_OPTIONS
    ) => {
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
