import type {
  LogoBarLogo,
  LogoListMap,
  LogoListRegion,
} from "@marketing/lib/logo_bars";
import { FALLBACK_LOGO_BARS } from "@marketing/lib/logo_bars";
import { createContext, useContext, useMemo } from "react";

// Editor-managed logo lists, fetched once per page in `getStaticProps` and
// handed to LandingLayout via pageProps. Context rather than props because the
// bars render deep inside page trees (TrustedBy sits ~4 levels down on the
// solutions pages), and threading a prop through every section component for
// this would be worse than the drift it replaces.
const LogoListsContext = createContext<LogoListMap>({});

export function LogoListsProvider({
  logoLists,
  children,
}: {
  logoLists?: LogoListMap;
  children: React.ReactNode;
}) {
  // Identity-stable so consumers don't re-render on every layout render.
  const value = useMemo(() => logoLists ?? {}, [logoLists]);
  return (
    <LogoListsContext.Provider value={value}>
      {children}
    </LogoListsContext.Provider>
  );
}

/**
 * Resolves the logos for one bar.
 *
 * Precedence: the published Contentful list for the visitor's region, then the
 * hardcoded lineup for `fallbackSlug`. Marketing takes over one region at a
 * time — publishing the FR list changes French visitors and nobody else — and
 * a page that doesn't fetch logo lists still renders the fallback, so adding a
 * bar to a new page can't produce an empty section.
 */
export function useLogoBar(
  region: LogoListRegion,
  fallbackSlug: string
): LogoBarLogo[] {
  const lists = useContext(LogoListsContext);
  return lists[region] ?? FALLBACK_LOGO_BARS[fallbackSlug] ?? [];
}
