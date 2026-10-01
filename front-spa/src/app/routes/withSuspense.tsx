import { Spinner, safeLazy } from "@dust-tt/sparkle";
import { Suspense } from "react";

function PageLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10">
      <Spinner size="sm" />
    </div>
  );
}

/**
 * @cc [owner:aubin-tchoi,label:react] lazy-route-export
 * The module returned by importFn MUST export a React component under exportName.
 * Route components loaded by name MUST retain their named export, even when they
 * also have a default export.
 */
export function withSuspense(
  importFn: () => Promise<Record<string, unknown>>,
  exportName: string
) {
  const LazyComponent = safeLazy(() =>
    importFn().then((module) => ({
      default: module[exportName] as React.ComponentType,
    }))
  );
  return function SuspenseWrapper() {
    return (
      <Suspense fallback={<PageLoader />}>
        <LazyComponent />
      </Suspense>
    );
  };
}
