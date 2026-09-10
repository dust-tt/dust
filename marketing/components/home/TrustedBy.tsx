// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { H4 } from "@marketing/components/home/ContentComponents";
import { LogoBarImage } from "@marketing/components/home/LogoBarImage";
import { useLogoBar } from "@marketing/components/home/LogoBarsContext";
import { cn } from "@marketing/components/poke/shadcn/lib/utils";
import { isEUCountry } from "@marketing/lib/geo/eu-detection";
import type { TrustedByLogoSet } from "@marketing/lib/logo_bars";
import { trustedByBarSlug } from "@marketing/lib/logo_bars";
import { useGeolocation } from "@marketing/lib/swr/geo";
import { TRACKING_AREAS, trackEvent } from "@marketing/lib/tracking";
import { useSignUpModal } from "@marketing/hooks/useSignUpModal";
import { Button } from "@dust-tt/sparkle";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type SizeKey = "default" | "large";

interface TrustedByProps {
  logoSet?: TrustedByLogoSet;
  size?: SizeKey;
  showTitle?: boolean;
}

export default function TrustedBy({
  logoSet = "default",
  size = "default",
  showTitle = true,
}: TrustedByProps) {
  const { openSignUpModal } = useSignUpModal();
  const { geoData } = useGeolocation();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Use requestAnimationFrame to avoid ESLint warning about synchronous setState in effect.
    const frameId = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  const regionParam = searchParams?.get("region");
  const region =
    regionParam === "us" || regionParam === "eu"
      ? regionParam
      : mounted && geoData?.countryCode && isEUCountry(geoData.countryCode)
        ? "eu"
        : "us";

  // Contentful-managed if a `logoBar` entry exists for this slug, else the
  // hardcoded lineup in lib/logo_bars.ts.
  const logos = useLogoBar(trustedByBarSlug(logoSet, region));

  const isLarge = size === "large";

  return (
    <div
      className={cn(
        "col-span-12 flex flex-col items-center",
        isLarge ? "py-6 sm:py-10" : "py-4 sm:py-8",
        "lg:col-span-12 lg:col-start-1",
        "xl:col-span-10 xl:col-start-2"
      )}
    >
      {showTitle && (
        <H4 className="mb-6 w-full text-center text-foreground">
          Trusted by <span className="text-blue-500">3,000+</span> organizations
        </H4>
      )}

      <div className="w-full">
        <div
          className={cn(
            "flex flex-wrap justify-center",
            isLarge
              ? "gap-x-8 gap-y-6 sm:gap-x-10 lg:gap-x-14 xl:gap-x-16"
              : "gap-x-6 gap-y-4 sm:gap-x-8 lg:gap-x-10 xl:gap-x-12"
          )}
        >
          {logos.map((logo, index) => (
            <div
              key={`${logo.name}-${index}`}
              className={cn(
                "flex flex-col items-center",
                isLarge
                  ? "w-40 sm:w-56 lg:w-52 xl:w-48"
                  : "w-36 sm:w-48 lg:w-44 xl:w-40"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center",
                  isLarge ? "h-14 sm:h-16" : "h-12 sm:h-14"
                )}
              >
                <LogoBarImage
                  logo={logo}
                  width={200}
                  height={80}
                  className={
                    isLarge
                      ? "max-h-20 sm:max-h-24 lg:max-h-28"
                      : "max-h-16 sm:max-h-20 lg:max-h-24"
                  }
                />
              </div>
              {logo.caseStudyUrl ? (
                <Link
                  href={logo.caseStudyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-mt-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() =>
                    trackEvent({
                      area: TRACKING_AREAS.HOME,
                      object: "case_study",
                      extra: { company: logo.name },
                    })
                  }
                >
                  Case study &rarr;
                </Link>
              ) : (
                <div className="h-4" />
              )}
            </div>
          ))}
        </div>
      </div>
      <Button
        variant="highlight"
        size="md"
        label="Join them"
        className="mt-8"
        onClick={openSignUpModal}
      />
    </div>
  );
}
