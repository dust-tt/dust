import Image from "next/image";
import { useState } from "react";

import { H4 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

// Define logo sets for different pages
const LOGO_SETS = {
  default: [
    { name: "clay", src: "/static/landing/logos/gray/clay.svg" },
    { name: "payfit", src: "/static/landing/logos/gray/payfit.svg" },
    { name: "patch", src: "/static/landing/logos/gray/patch.svg" },
    { name: "alan", src: "/static/landing/logos/gray/alan.svg" },
    { name: "photoroom", src: "/static/landing/logos/gray/photoroom.svg" },
    { name: "blueground", src: "/static/landing/logos/gray/blueground.svg" },
    { name: "qonto", src: "/static/landing/logos/gray/qonto.svg" },
  ],
  landing: [
    { name: "clay", src: "/static/landing/logos/gray/clay.svg" },
    { name: "payfit", src: "/static/landing/logos/gray/payfit.svg" },
    { name: "patch", src: "/static/landing/logos/gray/patch.svg" },
    { name: "alan", src: "/static/landing/logos/gray/alan.svg" },
    { name: "photoroom", src: "/static/landing/logos/gray/photoroom.svg" },
    { name: "blueground", src: "/static/landing/logos/gray/blueground.svg" },
    { name: "qonto", src: "/static/landing/logos/gray/qonto.svg" },
    {
      name: "contentsquare",
      src: "/static/landing/logos/gray/contentsquare.svg",
    },
    { name: "spendesk", src: "/static/landing/logos/gray/spendesk.svg" },
    { name: "gitguardian", src: "/static/landing/logos/gray/gitguardian.svg" },
    { name: "watershed", src: "/static/landing/logos/gray/watershed.svg" },
    { name: "doctolib", src: "/static/landing/logos/gray/doctolib.svg" },
    { name: "malt", src: "/static/landing/logos/gray/malt.svg" },
  ],
  b2bSaas: [
    { name: "clay", src: "/static/landing/logos/gray/clay.svg" },
    {
      name: "contentsquare",
      src: "/static/landing/logos/gray/contentsquare.svg",
    },
    { name: "payfit", src: "/static/landing/logos/gray/payfit.svg" },
    { name: "spendesk", src: "/static/landing/logos/gray/spendesk.svg" },
    { name: "gitguardian", src: "/static/landing/logos/gray/gitguardian.svg" },
    { name: "watershed", src: "/static/landing/logos/gray/watershed.svg" },
    { name: "doctolib", src: "/static/landing/logos/gray/doctolib.svg" },
  ],
} as const;

type LogoSetKey = keyof typeof LOGO_SETS;

interface TrustedByProps {
  logoSet?: LogoSetKey;
  title?: string;
}

export default function TrustedBy({
  logoSet = "default",
  title = "Trusted by SaaS Leaders",
}: TrustedByProps) {
  const [isPaused, setIsPaused] = useState(false);
  const logos = LOGO_SETS[logoSet];

  return (
    <div
      className={classNames(
        "col-span-12 flex flex-col items-center py-8",
        "lg:col-span-12 lg:col-start-1",
        "xl:col-span-10 xl:col-start-2"
      )}
    >
      <H4 className="mb-6 w-full text-center text-xs font-medium text-muted-foreground">
        {title}
      </H4>

      <div className="relative w-full overflow-hidden rounded-xl bg-white">
        <div
          className="relative mx-auto overflow-hidden"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div
            className="animate-marquee flex"
            style={{ animationPlayState: isPaused ? "paused" : "running" }}
          >
            {/* First set */}
            {logos.map((logo, index) => (
              <div
                key={`first-${logo.name}-${index}`}
                className="-mx-2 flex h-16 w-32 flex-shrink-0 items-center justify-center sm:mx-8 sm:h-20 sm:w-48 lg:mx-12"
              >
                <Image
                  alt={logo.name}
                  src={logo.src}
                  width={200}
                  height={80}
                  className="h-auto max-h-12 w-auto object-contain sm:max-h-16 lg:max-h-20"
                />
              </div>
            ))}
            {/* Second set - exact duplicate */}
            {logos.map((logo, index) => (
              <div
                key={`second-${logo.name}-${index}`}
                className="-mx-2 flex h-16 w-32 flex-shrink-0 items-center justify-center sm:mx-8 sm:h-20 sm:w-48 lg:mx-12"
              >
                <Image
                  alt={logo.name}
                  src={logo.src}
                  width={200}
                  height={80}
                  className="h-auto max-h-12 w-auto object-contain sm:max-h-16 lg:max-h-20"
                />
              </div>
            ))}
          </div>

          <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r from-white via-white/80 to-transparent sm:w-24 lg:w-32"></div>
          <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-white via-white/80 to-transparent sm:w-24 lg:w-32"></div>
        </div>

        <style jsx>{`
          @keyframes marquee {
            0% {
              transform: translate3d(0, 0, 0);
            }
            100% {
              transform: translate3d(-50%, 0, 0);
            }
          }

          .animate-marquee {
            animation: marquee 25s linear infinite;
          }
        `}</style>
      </div>
    </div>
  );
}
