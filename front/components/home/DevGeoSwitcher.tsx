// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { isDevelopment } from "@app/types/shared/env";
import { useRouter } from "next/router";

// Dev-only overlay for testing the geo-based logo set in HomeTrustedSection.
// Writes the `geo` URL query param that useLogoSet already consumes.
const OPTIONS = ["US", "GB", "FR"] as const;

export function DevGeoSwitcher() {
  const router = useRouter();

  if (!isDevelopment()) {
    return null;
  }

  const queryGeo = router.query.geo;
  const current = typeof queryGeo === "string" ? queryGeo.toUpperCase() : "US";

  const setGeo = (code: string) => {
    void router.replace(
      { pathname: router.pathname, query: { ...router.query, geo: code } },
      undefined,
      { shallow: true, scroll: false }
    );
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-[70] flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/90 px-1.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur"
      role="group"
      aria-label="Dev: country override for logo cloud"
    >
      <span className="px-2 text-white/40">Geo</span>
      {OPTIONS.map((code) => {
        const isActive = current === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setGeo(code)}
            className={`rounded-full px-2 py-1 transition-colors ${
              isActive
                ? "bg-blue-500 text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
