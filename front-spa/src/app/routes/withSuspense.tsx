import { Spinner, safeLazy } from "@dust-tt/sparkle";
import { Suspense } from "react";

function PageLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10">
      <Spinner size="sm" />
    </div>
  );
}

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
