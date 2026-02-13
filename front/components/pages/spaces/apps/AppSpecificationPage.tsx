import { Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { dumpSpecification } from "@app/lib/specification";
import { useApp } from "@app/lib/swr/apps";
import Custom404 from "@app/pages/404";
import type { SpecificationType } from "@app/types/app";

export function AppSpecificationPage() {
  const spaceId = useRequiredPathParam("spaceId");
  const aId = useRequiredPathParam("aId");
  const owner = useWorkspace();

  const { app, isAppLoading, isAppError } = useApp({
    workspaceId: owner.sId,
    spaceId,
    appId: aId,
  });

  // Compute the specification string from the app's saved specification
  const specification = useMemo(() => {
    if (!app) {
      return "";
    }
    try {
      const spec = JSON.parse(
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        app.savedSpecification || "[]"
      ) as SpecificationType;
      // Note: We don't have access to latestDatasets here, so we pass an empty object.
      // This means dataset hashes won't be shown, but the specification structure will be correct.
      return dumpSpecification(spec, {});
    } catch {
      return "";
    }
  }, [app]);

  if (isAppError || (!isAppLoading && !app)) {
    return <Custom404 />;
  }

  if (isAppLoading || !app) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-4">
      <h3>Current specifications:</h3>
      <div className="whitespace-pre font-mono text-sm text-gray-700">
        {specification}
      </div>
    </div>
  );
}
