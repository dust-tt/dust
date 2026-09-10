import type { LogoBarLogo, LogoBarMap } from "@marketing/lib/logo_bars";
import { FALLBACK_LOGO_BARS } from "@marketing/lib/logo_bars";
import { createContext, useContext, useMemo } from "react";

// Editor-managed logo bars, fetched once per page in `getStaticProps` and
// handed to LandingLayout via pageProps. Context rather than props because the
// bars render deep inside page trees (TrustedBy sits ~4 levels down on the
// solutions pages), and threading a prop through every section component for
// this would be worse than the drift it replaces.
const LogoBarsContext = createContext<LogoBarMap>({});

export function LogoBarsProvider({
  logoBars,
  children,
}: {
  logoBars?: LogoBarMap;
  children: React.ReactNode;
}) {
  // Identity-stable so consumers don't re-render on every layout render.
  const value = useMemo(() => logoBars ?? {}, [logoBars]);
  return (
    <LogoBarsContext.Provider value={value}>
      {children}
    </LogoBarsContext.Provider>
  );
}

/**
 * Resolves one logo bar by its Contentful `barSlug`.
 *
 * Precedence: published Contentful entry, then the hardcoded fallback. A page
 * that doesn't fetch logo bars still renders the fallback, so adding a bar to
 * a new page can't produce an empty section.
 */
export function useLogoBar(slug: string): LogoBarLogo[] {
  const bars = useContext(LogoBarsContext);
  return bars[slug] ?? FALLBACK_LOGO_BARS[slug] ?? [];
}
