import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";
import { Button } from "@dust-tt/sparkle";

interface ChatGptEnterpriseCTAProps {
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
}

export function ChatGptEnterpriseCTA({
  title,
  subtitle,
  buttonText,
  buttonLink,
}: ChatGptEnterpriseCTAProps) {
  return (
    <section className="w-full">
      <div
        className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen overflow-hidden bg-[#111418] px-6 py-16 text-white md:py-24"
      >
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-[10%] -top-[50%] h-[150%] w-[70%] rounded-full bg-[#1C91FF]/20 blur-[120px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
            {title}
          </h2>
          <p className="mx-auto mb-10 max-w-2xl text-xl text-gray-300">
            {subtitle}
          </p>

          <Button
            variant="highlight"
            size="md"
            label={buttonText}
            onClick={withTracking(
              TRACKING_AREAS.COMPETITIVE,
              "chatgpt_enterprise_bottom_cta",
              () => {
                // eslint-disable-next-line react-hooks/immutability
                window.location.href = appendUTMParams(buttonLink);
              }
            )}
          />
        </div>
      </div>
    </section>
  );
}
