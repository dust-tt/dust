import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { ReactNode } from "react";
import { fetcher, fetcherWithBody } from "./fetcher";

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
