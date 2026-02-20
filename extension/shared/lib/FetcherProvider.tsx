import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherFn, FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { resHandler } from "@extension/shared/lib/swr";
import { useAuth } from "@extension/ui/components/auth/AuthProvider";
import type { ReactNode } from "react";
import { useMemo } from "react";

interface ExtensionFetcherProviderProps {
  children: ReactNode;
}

export function ExtensionFetcherProvider({
  children,
}: ExtensionFetcherProviderProps) {
  const { token } = useAuth();

  const { fetcher, fetcherWithBody } = useMemo(() => {
    const addAuthHeaders = (headers: HeadersInit = {}): HeadersInit => ({
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });

    const fetcher: FetcherFn = async (url, init) => {
      const res = await fetch(url, {
        ...init,
        headers: addAuthHeaders(init?.headers),
      });
      return resHandler(res);
    };

    const fetcherWithBody: FetcherWithBodyFn = async (
      [url, body, method],
      init
    ) => {
      const res = await fetch(url, {
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
  }, [token]);

  return (
    <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
      {children}
    </FetcherProvider>
  );
}
