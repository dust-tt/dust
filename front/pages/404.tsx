import { Button, LogoutIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Custom404() {
  const [currentURL, setCurrentURL] = useState("");

  useEffect(() => {
    // Only set the URL on the client-side
    if (typeof window !== "undefined") {
      setCurrentURL(window.location.href);
    }
  }, []);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col gap-3 text-center">
        <div>
          <span className="text-4xl font-normal leading-10 text-foreground dark:text-foreground-night">
            ☕️
          </span>
          <p className="text-xl font-bold leading-7 text-foreground dark:text-foreground-night">
            404: Page not found
          </p>
          <p className="text-sm font-normal leading-tight text-muted-foreground dark:text-muted-foreground-night">
            Looks like this page took an unscheduled coffee break.
          </p>
          {currentURL && (
            <p className="dark:text-slate-400-night mt-2 text-xs text-slate-400">
              Attempted URL: {currentURL}
            </p>
          )}
        </div>
        <Link href="/">
          <Button
            variant="highlight"
            label="Back to homepage"
            icon={LogoutIcon}
          />
        </Link>
      </div>
    </div>
  );
}
