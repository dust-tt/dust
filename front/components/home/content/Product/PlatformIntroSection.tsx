import { Button } from "@dust-tt/sparkle";

import { H1, P } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export function PlatformIntroSection() {
  return (
    <div
      className={classNames(
        "flex flex-col justify-end gap-4 pt-12 sm:pt-12 lg:pt-24",
        "col-span-10"
      )}
    >
      <P size="lg" className="text-muted-foreground">
        Dust Platform
      </P>
      <H1
        mono
        className="text-5xl font-medium leading-tight md:text-6xl lg:text-7xl"
      >
        For Developers
      </H1>
      <P size="lg" className="text-muted-foreground">
        Push the boundaries by building custom actions and integrations
        to&nbsp;fit your team's exact&nbsp;needs.
      </P>
      <div className="flex flex-col gap-4 xs:flex-row sm:flex-row md:flex-row">
        <Button
          variant="primary"
          label="Go to Documentation"
          size="md"
          className="mt-8"
          href="https://docs.dust.tt"
          target="_blank"
        />
      </div>
    </div>
  );
}
