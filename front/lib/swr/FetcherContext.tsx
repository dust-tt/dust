import type {
  ClientFetchFn,
  FetcherFn,
  FetcherWithBodyFn,
} from "@app/lib/swr/fetcher";
import { createContext, useContext, useMemo } from "react";

interface FetcherContextType {
  fetcher: FetcherFn;
  fetcherWithBody: FetcherWithBodyFn;
  clientFetch: ClientFetchFn;
}

const FetcherContext = createContext<FetcherContextType | null>(null);

export function useFetcher(): FetcherContextType {
  const ctx = useContext(FetcherContext);
  if (!ctx) {
    throw new Error("useFetcher must be used within a FetcherProvider");
  }
  return ctx;
}

interface FetcherProviderProps {
  fetcher: FetcherFn;
  fetcherWithBody: FetcherWithBodyFn;
  clientFetch: ClientFetchFn;
  children: React.ReactNode;
}

export function FetcherProvider({
  fetcher,
  fetcherWithBody,
  clientFetch,
  children,
}: FetcherProviderProps) {
  const value = useMemo(
    () => ({ fetcher, fetcherWithBody, clientFetch }),
    [fetcher, fetcherWithBody, clientFetch]
  );
  return (
    <FetcherContext.Provider value={value}>{children}</FetcherContext.Provider>
  );
}
