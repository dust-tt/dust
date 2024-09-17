import { Button, LoginIcon } from "@dust-tt/sparkle";
import Link from "next/link";

export default function Custom500() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col gap-3 text-center">
        <div>
          <span className="text-4xl font-normal leading-10 text-slate-900">
            ☕️
          </span>
          <p className="text-xl font-bold leading-7 text-slate-900">
            500: Unexpected error
          </p>
          <p className="max-w-48 text-sm font-normal leading-tight text-slate-500">
            Looks like this page took an unscheduled coffee break.
          </p>
        </div>
        <Link href="/">
          <Button
            variant="tertiary"
            label="Back to homepage"
            icon={LoginIcon}
          />
        </Link>
      </div>
    </div>
  );
}
