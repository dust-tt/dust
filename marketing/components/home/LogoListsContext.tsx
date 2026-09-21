import type {
  LogoBarLogo,
  LogoListMap,
  LogoListRegion,
} from "@marketing/lib/logo_bars";
import {
  FALLBACK_LOGO_BARS,
  LOGO_LIST_REGION_ALIASES,
} from "@marketing/lib/logo_bars";
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
 * list of the region it borrows from (see LOGO_LIST_REGION_ALIASES), then the
 * hardcoded lineup for `fallbackSlug`. Marketing takes over one region at a
 * time — publishing the FR list changes French visitors and nobody else — and
 * a page that doesn't fetch logo lists still renders the fallback, so adding a
 * bar to a new page can't produce an empty section.
 *
 * The alias sits below the region's own list on purpose: a borrowed list is
 * what a region gets *until* it has one, so publishing its own takes over with
 * no further change here.
 *
 * @cc [owner:radjakahoul,label:product] logo-bar-precedence
 * Returns the first of: the published list for `region`, the published list of
 * `LOGO_LIST_REGION_ALIASES[region]`, `FALLBACK_LOGO_BARS[fallbackSlug]`. Never
 * returns an empty array while `fallbackSlug` names a bar, so a bar cannot
 * render as a gap when Contentful is unreachable or a region has no list.
 */
export function useLogoBar(
  region: LogoListRegion,
  fallbackSlug: string
): LogoBarLogo[] {
  const lists = useContext(LogoListsContext);
  const aliasRegion = LOGO_LIST_REGION_ALIASES[region];
  return (
    lists[region] ??
    (aliasRegion ? lists[aliasRegion] : undefined) ??
    FALLBACK_LOGO_BARS[fallbackSlug] ??
    []
  );
}
