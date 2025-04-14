import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";

import { H3 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export function CallToActionSection() {
  return (
    <div
      className={classNames(
        "flex flex-col items-center justify-center py-16",
        "rounded-2xl bg-blue-50"
      )}
    >
      <H3 className="mb-8 text-center text-gray-900">Just use Dust.</H3>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <Link href="home/pricing" shallow={true}>
          <Button
            variant="highlight"
            size="md"
            label="Try Dust now"
            icon={RocketIcon}
          />
        </Link>
        <Link href="home/contact" shallow={true}>
          <Button variant="outline" size="md" label="Request demo now" />
        </Link>
      </div>
    </div>
  );
}
