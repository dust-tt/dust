import Image from "next/image";

import { H4 } from "@app/components/home/ContentComponents";
import { isEUCountry } from "@app/lib/geo/eu-detection";
import { useGeolocation } from "@app/lib/swr/geo";
import { classNames } from "@app/lib/utils";

const LOGO_SETS = {
  default: {
    us: [
      { name: "blueground", src: "/static/landing/logos/gray/blueground.svg" },
      { name: "clay", src: "/static/landing/logos/gray/clay.svg" },
      { name: "cursor", src: "/static/landing/logos/gray/cursor.svg" },
      { name: "assembled", src: "/static/landing/logos/gray/assembled.svg" },
      { name: "kyriba", src: "/static/landing/logos/gray/kyriba.svg" },
      { name: "patch", src: "/static/landing/logos/gray/patch.svg" },
      { name: "persona", src: "/static/landing/logos/gray/persona.svg" },
      { name: "photoroom", src: "/static/landing/logos/gray/photoroom.svg" },
      { name: "mirakl", src: "/static/landing/logos/gray/mirakl.svg" },
      { name: "qonto", src: "/static/landing/logos/gray/qonto.svg" },
      { name: "watershed", src: "/static/landing/logos/gray/watershed.svg" },
      { name: "whatnot", src: "/static/landing/logos/gray/whatnot.svg" },
    ],
    eu: [
      { name: "alan", src: "/static/landing/logos/gray/alan.svg" },
      { name: "backmarket", src: "/static/landing/logos/gray/backmarket.svg" },
      { name: "blueground", src: "/static/landing/logos/gray/blueground.svg" },
      { name: "clay", src: "/static/landing/logos/gray/clay.svg" },
      { name: "cursor", src: "/static/landing/logos/gray/cursor.svg" },
      { name: "doctolib", src: "/static/landing/logos/gray/doctolib.svg" },
      { name: "malt", src: "/static/landing/logos/gray/malt.svg" },
      { name: "mirakl", src: "/static/landing/logos/gray/mirakl.svg" },
      { name: "payfit", src: "/static/landing/logos/gray/payfit.svg" },
      { name: "photoroom", src: "/static/landing/logos/gray/photoroom.svg" },
      { name: "pennylane", src: "/static/landing/logos/gray/pennylane.svg" },
      { name: "qonto", src: "/static/landing/logos/gray/qonto.svg" },
    ],
  },
  landing: {
    us: [
      { name: "blueground", src: "/static/landing/logos/gray/blueground.svg" },
      { name: "clay", src: "/static/landing/logos/gray/clay.svg" },
      { name: "cursor", src: "/static/landing/logos/gray/cursor.svg" },
      { name: "assembled", src: "/static/landing/logos/gray/assembled.svg" },
      { name: "laurel", src: "/static/landing/logos/gray/laurel.svg" },
      { name: "patch", src: "/static/landing/logos/gray/patch.svg" },
      { name: "persona", src: "/static/landing/logos/gray/persona.svg" },
      { name: "photoroom", src: "/static/landing/logos/gray/photoroom.svg" },
      { name: "vanta", src: "/static/landing/logos/gray/vanta.svg" },
      { name: "qonto", src: "/static/landing/logos/gray/qonto.svg" },
      { name: "watershed", src: "/static/landing/logos/gray/watershed.svg" },
      { name: "whatnot", src: "/static/landing/logos/gray/whatnot.svg" },
    ],
    eu: [
      { name: "alan", src: "/static/landing/logos/gray/alan.svg" },
      { name: "backmarket", src: "/static/landing/logos/gray/backmarket.svg" },
      { name: "blueground", src: "/static/landing/logos/gray/blueground.svg" },
      { name: "clay", src: "/static/landing/logos/gray/clay.svg" },
      { name: "cursor", src: "/static/landing/logos/gray/cursor.svg" },
      { name: "doctolib", src: "/static/landing/logos/gray/doctolib.svg" },
      { name: "malt", src: "/static/landing/logos/gray/malt.svg" },
      { name: "vanta", src: "/static/landing/logos/gray/vanta.svg" },
      { name: "payfit", src: "/static/landing/logos/gray/payfit.svg" },
      { name: "photoroom", src: "/static/landing/logos/gray/photoroom.svg" },
      { name: "pennylane", src: "/static/landing/logos/gray/pennylane.svg" },
      { name: "qonto", src: "/static/landing/logos/gray/qonto.svg" },
    ],
  },
  b2bSaas: {
    us: [
      { name: "clay", src: "/static/landing/logos/gray/clay.svg" },
      {
        name: "contentsquare",
        src: "/static/landing/logos/gray/contentsquare.svg",
      },
      { name: "cursor", src: "/static/landing/logos/gray/cursor.svg" },
      { name: "persona", src: "/static/landing/logos/gray/persona.svg" },
      { name: "spendesk", src: "/static/landing/logos/gray/spendesk.svg" },
      { name: "watershed", src: "/static/landing/logos/gray/watershed.svg" },
    ],
    eu: [
      { name: "clay", src: "/static/landing/logos/gray/clay.svg" },
      {
        name: "contentsquare",
        src: "/static/landing/logos/gray/contentsquare.svg",
      },
      { name: "cursor", src: "/static/landing/logos/gray/cursor.svg" },
      {
        name: "gitguardian",
        src: "/static/landing/logos/gray/gitguardian.svg",
      },
      { name: "payfit", src: "/static/landing/logos/gray/payfit.svg" },
      { name: "spendesk", src: "/static/landing/logos/gray/spendesk.svg" },
    ],
  },
  marketplace: {
    us: [
      { name: "blueground", src: "/static/landing/logos/gray/blueground.svg" },
      { name: "doctolib", src: "/static/landing/logos/gray/doctolib.svg" },
      { name: "malt", src: "/static/landing/logos/gray/malt.svg" },
      { name: "mirakl", src: "/static/landing/logos/gray/mirakl.svg" },
      {
        name: "wttj",
        src: "/static/landing/logos/gray/welcometothejungle.svg",
      },
    ],
    eu: [
      { name: "blueground", src: "/static/landing/logos/gray/blueground.svg" },
      { name: "doctolib", src: "/static/landing/logos/gray/doctolib.svg" },
      { name: "malt", src: "/static/landing/logos/gray/malt.svg" },
      { name: "mirakl", src: "/static/landing/logos/gray/mirakl.svg" },
      {
        name: "wttj",
        src: "/static/landing/logos/gray/welcometothejungle.svg",
      },
    ],
  },
  finance: {
    us: [
      { name: "kyriba", src: "/static/landing/logos/gray/kyriba.svg" },
      { name: "pennylane", src: "/static/landing/logos/gray/pennylane.svg" },
      { name: "spendesk", src: "/static/landing/logos/gray/spendesk.svg" },
      { name: "qonto", src: "/static/landing/logos/gray/qonto.svg" },
    ],
    eu: [
      { name: "kyriba", src: "/static/landing/logos/gray/kyriba.svg" },
      { name: "pennylane", src: "/static/landing/logos/gray/pennylane.svg" },
      { name: "spendesk", src: "/static/landing/logos/gray/spendesk.svg" },
      { name: "qonto", src: "/static/landing/logos/gray/qonto.svg" },
    ],
  },
  insurance: {
    us: [
      { name: "alan", src: "/static/landing/logos/gray/alan.svg" },
      { name: "wakam", src: "/static/landing/logos/gray/wakam.svg" },
    ],
    eu: [
      { name: "alan", src: "/static/landing/logos/gray/alan.svg" },
      { name: "wakam", src: "/static/landing/logos/gray/wakam.svg" },
    ],
  },
  retail: {
    us: [
      { name: "backmarket", src: "/static/landing/logos/gray/backmarket.svg" },
      { name: "fleet", src: "/static/landing/logos/gray/fleet.svg" },
      { name: "jumia", src: "/static/landing/logos/gray/Jumia.svg" },
      { name: "mirakl", src: "/static/landing/logos/gray/mirakl.svg" },
      { name: "photoroom", src: "/static/landing/logos/gray/photoroom.svg" },
      { name: "whatnot", src: "/static/landing/logos/gray/whatnot.svg" },
    ],
    eu: [
      { name: "backmarket", src: "/static/landing/logos/gray/backmarket.svg" },
      { name: "fleet", src: "/static/landing/logos/gray/fleet.svg" },
      { name: "jumia", src: "/static/landing/logos/gray/Jumia.svg" },
      { name: "mirakl", src: "/static/landing/logos/gray/mirakl.svg" },
      { name: "photoroom", src: "/static/landing/logos/gray/photoroom.svg" },
      { name: "whatnot", src: "/static/landing/logos/gray/whatnot.svg" },
    ],
  },
} as const;

type LogoSetKey = keyof typeof LOGO_SETS;
type RegionKey = "us" | "eu";

interface TrustedByProps {
  logoSet?: LogoSetKey;
  region?: RegionKey;
  title?: string;
}

export default function TrustedBy({
  logoSet = "default",
  title = "Trusted by 1,000+ organizations",
}: TrustedByProps) {
  const { geoData } = useGeolocation();
  const isEU = isEUCountry(geoData?.countryCode);
  const logos = LOGO_SETS[logoSet][isEU ? "eu" : "us"];

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
        <div className="flex flex-wrap justify-center gap-6 sm:gap-8 lg:gap-10 xl:gap-12">
          {logos.map((logo, index) => (
            <div
              key={`${logo.name}-${index}`}
              className="flex h-20 w-36 items-center justify-center sm:h-24 sm:w-48 lg:w-44 xl:w-40"
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
