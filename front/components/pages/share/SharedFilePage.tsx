import { useAppRouter, usePathParam } from "@app/lib/platform";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

/**
 * SharedFilePage redirects to SharedFramePage.
 * This is a client-side permanent redirect from /share/file/:token to /share/frame/:token
 */
export function SharedFilePage() {
  const token = usePathParam("token");
  const router = useAppRouter();

  useEffect(() => {
    if (token) {
      void router.replace(`/share/frame/${token}`);
    }
  }, [token, router]);

  return (
    <div className="flex h-dvh w-full items-center justify-center">
      <Spinner size="xl" />
    </div>
  );
}
