import { setBaseUrlResolver } from "@app/lib/api/config";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherFn, FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { useExtensionAuth } from "@extension/shared/lib/AuthProvider";
import { resHandler } from "@extension/shared/lib/swr";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";

interface ExtensionFetcherProviderProps {
  children: ReactNode;
}

export function ExtensionFetcherProvider({
  children,
}: ExtensionFetcherProviderProps) {
  const { token, user } = useExtensionAuth();

  useEffect(() => {
    if (user?.dustDomain) {
      setBaseUrlResolver(() => user.dustDomain);
    }
    return () => setBaseUrlResolver(null);
  }, [user?.dustDomain]);

  const { fetcher, fetcherWithBody } = useMemo(() => {
    const dustDomain = user?.dustDomain ?? "";

    const resolveUrl = (url: string) =>
      url.startsWith("/") ? `${dustDomain}${url}` : url;

    const addAuthHeaders = (headers: HeadersInit = {}): HeadersInit => ({
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });

    const fetcher: FetcherFn = async (url, init) => {
      const res = await fetch(resolveUrl(url), {
        ...init,
        headers: addAuthHeaders(init?.headers),
      });
      return resHandler(res);
    };

    const fetcherWithBody: FetcherWithBodyFn = async (
      [url, body, method],
      init
    ) => {
      const res = await fetch(resolveUrl(url), {
        ...init,
        method,
        headers: addAuthHeaders({
          ...init?.headers,
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(body),
      });
      return resHandler(res);
    };

    return { fetcher, fetcherWithBody };
  }, [token, user?.dustDomain]);

  return (
    <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
      {children}
    </FetcherProvider>
  );
}
