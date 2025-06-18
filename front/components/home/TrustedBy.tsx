import Image from "next/image";

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
    { name: "doctolib", src: "/static/landing/logos/gray/doctolib.svg" },
    { name: "watershed", src: "/static/landing/logos/gray/watershed.svg" },
    { name: "photoroom", src: "/static/landing/logos/gray/photoroom.svg" },
    { name: "pennylane", src: "/static/landing/logos/gray/pennylane.svg" },
    { name: "payfit", src: "/static/landing/logos/gray/payfit.svg" },
    { name: "malt", src: "/static/landing/logos/gray/malt.svg" },
    { name: "alan", src: "/static/landing/logos/gray/alan.svg" },
    { name: "blueground", src: "/static/landing/logos/gray/blueground.svg" },
    { name: "qonto", src: "/static/landing/logos/gray/qonto.svg" },
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
  title = "Trusted by 1,000+ organizations",
}: TrustedByProps) {
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

      <div className="w-full">
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 md:gap-10 lg:gap-12">
          {logos.map((logo, index) => (
            <div
              key={`${logo.name}-${index}`}
              className="flex h-20 items-center justify-center sm:h-24"
            >
              <Image
                alt={logo.name}
                src={logo.src}
                width={200}
                height={80}
                className="h-auto max-h-16 w-auto object-contain sm:max-h-20 lg:max-h-24"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
