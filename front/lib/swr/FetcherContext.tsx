import type { FetcherFn, FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { createContext, useContext, useMemo } from "react";

interface FetcherContextType {
  fetcher: FetcherFn;
  fetcherWithBody: FetcherWithBodyFn;
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
  children: React.ReactNode;
}

export function FetcherProvider({
  fetcher,
  fetcherWithBody,
  children,
}: FetcherProviderProps) {
  const value = useMemo(
    () => ({ fetcher, fetcherWithBody }),
    [fetcher, fetcherWithBody]
  );
  return (
    <FetcherContext.Provider value={value}>{children}</FetcherContext.Provider>
  );
}
