import { getAllLogoLists } from "@marketing/lib/contentful/client";
import type { LogoListMap } from "@marketing/lib/contentful/types";

// Server-only half of lib/logo_bars.ts. Kept in its own module so that
// importing the fallback lineups or the region helpers from a client component
// doesn't pull the Contentful SDK, the logger and the server config into the
// browser bundle.
//
// Designed to be called from `getStaticProps`. A region with no published list
// — and a Contentful failure, which yields no lists at all — falls through to
// the hardcoded per-bar lineups at render time, so the bars degrade to today's
// behaviour rather than rendering empty.
export async function fetchLogoLists(): Promise<LogoListMap> {
  const result = await getAllLogoLists();
  if (result.isErr()) {
    return {};
  }
  return result.value;
}
