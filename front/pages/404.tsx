import {
  Button,
  ExclamationCircleIcon,
  Icon,
  LoginIcon,
} from "@dust-tt/sparkle";
import Link from "next/link";

export default function Custom404() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex flex-col gap-3 text-center">
        <div className="flex flex-col items-center">
          <div>
            <Icon
              visual={ExclamationCircleIcon}
              size="lg"
              className="dark:text-golder-400-night text-golden-400"
            />
          </div>
          <p className="heading-xl leading-7 text-foreground dark:text-foreground-night">
            404: Page not found
          </p>
          <p className="copy-sm leading-tight text-muted-foreground dark:text-muted-foreground-night">
            Looks like this page took an unscheduled coffee break.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" label="Back to homepage" icon={LoginIcon} />
        </Link>
      </div>
    </div>
  );
}
