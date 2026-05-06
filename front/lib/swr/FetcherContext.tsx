import type {
  FetcherFn,
  FetcherTextFn,
  FetcherWithBodyFn,
} from "@app/lib/swr/fetcher";
import { createContext, useContext, useMemo } from "react";

interface FetcherContextType {
  fetcher: FetcherFn;
  fetcherText: FetcherTextFn;
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
  fetcherText: FetcherTextFn;
  fetcherWithBody: FetcherWithBodyFn;
  children: React.ReactNode;
}

export function FetcherProvider({
  fetcher,
  fetcherText,
  fetcherWithBody,
  children,
}: FetcherProviderProps) {
  const value = useMemo(
    () => ({ fetcher, fetcherText, fetcherWithBody }),
    [fetcher, fetcherText, fetcherWithBody]
  );

  return (
    <FetcherContext.Provider value={value}>{children}</FetcherContext.Provider>
  );
}
