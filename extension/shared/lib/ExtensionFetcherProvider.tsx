import { clientFetch } from "@app/lib/egress/client";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherFn, FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { resHandler } from "@extension/shared/lib/swr";
import { useExtensionAuth } from "@extension/ui/components/auth/AuthProvider";
import type { ReactNode } from "react";
import { useMemo } from "react";

interface ExtensionFetcherProviderProps {
  children: ReactNode;
}

export function ExtensionFetcherProvider({
  children,
}: ExtensionFetcherProviderProps) {
  const { token } = useExtensionAuth();

  const { fetcher, fetcherWithBody } = useMemo(() => {
    const addAuthHeaders = (headers: HeadersInit = {}): HeadersInit => ({
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });

    const fetcher: FetcherFn = async (url, init, options) => {
      const res = await clientFetch(url, {
        ...init,
        headers: addAuthHeaders(init?.headers),
        credentials: "omit", // Ensure cookies are not sent with requests from the extension
      });
      return resHandler(res, options);
    };

    const fetcherWithBody: FetcherWithBodyFn = async (
      [url, body, method],
      init,
      options
    ) => {
      const res = await clientFetch(url, {
        ...init,
        method,
        headers: addAuthHeaders({
          ...init?.headers,
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(body),
        credentials: "omit", // Ensure cookies are not sent with requests from the extension
      });
      return resHandler(res, options);
    };

    return { fetcher, fetcherWithBody };
  }, [token]);

  return (
    <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
      {children}
    </FetcherProvider>
  );
}
