import { ADMIN_ROUTE_PATTERNS } from "@app/components/navigation/config";
import { ADMIN_SEARCH_INDEX } from "@app/lib/admin/adminSearchIndex";
import { allAdminSectionIds } from "@app/lib/admin/adminSectionIds";
import { describe, expect, it } from "vitest";

function sorted(ids: Iterable<string>): string[] {
  return [...ids].sort();
}

describe("ADMIN_SEARCH_INDEX drift", () => {
  const declaredSectionIds = new Set(allAdminSectionIds());
  const indexedSectionIds = new Set(ADMIN_SEARCH_INDEX.map((e) => e.sectionId));
  const indexedPageIds = new Set(ADMIN_SEARCH_INDEX.map((e) => e.pageId));

  it("every index pageId is a known admin nav id", () => {
    const known = new Set(Object.keys(ADMIN_ROUTE_PATTERNS));
    for (const entry of ADMIN_SEARCH_INDEX) {
      expect(known.has(entry.pageId), `unknown pageId: ${entry.pageId}`).toBe(
        true
      );
    }
  });

  it("every admin sidebar page has at least one search entry", () => {
    for (const pageId of Object.keys(
      ADMIN_ROUTE_PATTERNS
    ) as (keyof typeof ADMIN_ROUTE_PATTERNS)[]) {
      expect(
        indexedPageIds.has(pageId),
        `admin page missing from search index: ${pageId}`
      ).toBe(true);
    }
  });

  it("every declared section appears in the index, and vice versa", () => {
    expect(sorted(indexedSectionIds)).toEqual(sorted(declaredSectionIds));
  });

  it("has unique labels within each page/section", () => {
    const seen = new Set<string>();
    for (const entry of ADMIN_SEARCH_INDEX) {
      const key = `${entry.pageId}/${entry.sectionId}/${entry.label}`;
      expect(seen.has(key), `duplicate search entry: ${key}`).toBe(false);
      seen.add(key);
    }
  });
});
