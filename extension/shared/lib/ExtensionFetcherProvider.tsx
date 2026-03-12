import { clientFetch } from "@app/lib/egress/client";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherFn, FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { resHandler } from "@extension/shared/lib/swr";
import type { ReactNode } from "react";

// Credentials and Authorization headers are handled by the defaultInitResolver
// (set in useAuth), so fetchers are plain clientFetch wrappers.
const fetcher: FetcherFn = async (url, init) => {
  const res = await clientFetch(url, init);
  return resHandler(res);
};

const fetcherWithBody: FetcherWithBodyFn = async (
  [url, body, method],
  init
) => {
  const res = await clientFetch(url, {
    ...init,
    method,
    headers: {
      ...((init?.headers as Record<string, string>) ?? {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return resHandler(res);
};

interface ExtensionFetcherProviderProps {
  children: ReactNode;
}

export function ExtensionFetcherProvider({
  children,
}: ExtensionFetcherProviderProps) {
  return (
    <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
      {children}
    </FetcherProvider>
  );
}
