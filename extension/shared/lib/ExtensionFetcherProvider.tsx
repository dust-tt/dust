import { clientFetch } from "@app/lib/egress/client";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type {
  ClientFetchFn,
  FetcherFn,
  FetcherWithBodyFn,
} from "@app/lib/swr/fetcher";
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

  const { fetcher, fetcherWithBody, extensionClientFetch } = useMemo(() => {
    const addAuthHeaders = (headers: HeadersInit = {}): HeadersInit => ({
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });

    const extensionClientFetch: ClientFetchFn = async (url, init) => {
      const res = await clientFetch(url, {
        ...init,
        headers: addAuthHeaders(init?.headers),
        credentials: "omit", // Ensure cookies are not sent with requests from the extension
      });
      return res;
    };

    const fetcher: FetcherFn = async (url, init) => {
      const res = await extensionClientFetch(url, init);
      return resHandler(res);
    };

    const fetcherWithBody: FetcherWithBodyFn = async (
      [url, body, method],
      init
    ) => {
      const res = await extensionClientFetch(url, {
        ...init,
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return resHandler(res);
    };

    return { fetcher, fetcherWithBody, extensionClientFetch };
  }, [token]);

  return (
    <FetcherProvider
      fetcher={fetcher}
      fetcherWithBody={fetcherWithBody}
      clientFetch={extensionClientFetch}
    >
      {children}
    </FetcherProvider>
  );
}
