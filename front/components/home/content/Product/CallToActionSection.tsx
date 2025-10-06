import { RocketIcon } from "@dust-tt/sparkle";

import { H3 } from "@app/components/home/ContentComponents";
import UTMButton from "@app/components/UTMButton";
import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";
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
        <UTMButton
          variant="highlight"
          size="md"
          label="Try Dust now"
          icon={RocketIcon}
          href="/home/pricing"
          onClick={() =>
            trackEvent({
              area: TRACKING_AREAS.HOME,
              object: "cta_try_dust",
              action: "click",
            })
          }
        />
        <UTMButton
          variant="outline"
          size="md"
          label="Request demo now"
          href="/home/contact"
          onClick={() =>
            trackEvent({
              area: TRACKING_AREAS.HOME,
              object: "cta_request_demo",
              action: "click",
            })
          }
        />
      </div>
    </div>
  );
}
