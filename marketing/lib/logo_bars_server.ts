import { getAllLogoBars } from "@marketing/lib/contentful/client";
import type { LogoBarMap } from "@marketing/lib/contentful/types";

// Server-only half of lib/logo_bars.ts. Kept in its own module so that
// importing the fallback lineup or the bar slugs from a client component
// doesn't pull the Contentful SDK, the logger and the server config into the
// browser bundle.
//
// Designed to be called from `getStaticProps`. The result is merged *over*
// FALLBACK_LOGO_BARS at render time, so a bar with no Contentful entry keeps
// its hardcoded lineup, and a Contentful failure degrades to the hardcoded
// lineup everywhere rather than rendering an empty bar.
export async function fetchLogoBars(): Promise<LogoBarMap> {
  const result = await getAllLogoBars();
  if (result.isErr()) {
    return {};
  }
  return result.value;
}
