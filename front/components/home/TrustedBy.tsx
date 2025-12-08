import { Button } from "@dust-tt/sparkle";
import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { H4 } from "@app/components/home/ContentComponents";
import { isEUCountry } from "@app/lib/geo/eu-detection";
import { useGeolocation } from "@app/lib/swr/geo";
import { classNames } from "@app/lib/utils";

const CASE_STUDIES: Record<string, string> = {
  alan: "/customers/alans-pmm-team-transforms-sales-conversations-into-intelligence-with-ai-agents",
  blueground: "/customers/customer-support-blueground",
  clay: "/customers/clay-scaling-gtme-team",
  doctolib:
    "/customers/doctolibs-ai-adoption-playbook-from-30-person-pilot-to-company-wide-deployment",
  fleet: "/customers/how-valentine-head-of-marketing-at-fleet-uses-dust",
  kyriba: "/customers/kyriba-accelerating-innovation-with-dust",
  malt: "/customers/malt-customer-support",
  mirakl: "/customers/why-mirakl-chose-dust-as-its-go-to-agentic-solution",
  patch:
    "/customers/how-patch-empowered-70-of-its-team-to-use-ai-agents-weekly",
  payfit:
    "/customers/less-admin-more-selling-how-dust-frees-up-payfits-sales-team-to-close-more-deals",
  pennylane: "/customers/pennylane-customer-support-journey",
  persona: "/customers/how-persona-hit-80-ai-agent-adoption-with-dust",
  qonto: "/customers/qonto-dust-ai-partnership",
  wakam:
    "/customers/how-wakam-cut-legal-contract-analysis-time-by-50-with-dust",
  watershed:
    "/customers/how-watershed-got-90-of-its-team-to-leverage-dust-agents",
};

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
}

const emptySubscribe = () => () => {};

export default function TrustedBy({ logoSet = "default" }: TrustedByProps) {
  const { geoData } = useGeolocation();
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Use "us" as default for SSR, switch to actual region on client
  const region =
    isClient && geoData?.countryCode && isEUCountry(geoData.countryCode)
      ? "eu"
      : "us";

  const logos = LOGO_SETS[logoSet][region];

  return (
    <div
      className={classNames(
        "col-span-12 flex flex-col items-center py-4 sm:py-8",
        "lg:col-span-12 lg:col-start-1",
        "xl:col-span-10 xl:col-start-2"
      )}
    >
      <H4 className="mb-6 w-full text-center text-xs font-medium text-muted-foreground">
        Trusted by <span className="text-blue-500">1,000+</span> organizations
      </H4>

      <div className="w-full">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-4 sm:gap-x-8 lg:gap-x-10 xl:gap-x-12">
          {logos.map((logo, index) => {
            const caseStudyUrl = CASE_STUDIES[logo.name];
            return (
              <div
                key={`${logo.name}-${index}`}
                className="flex w-36 flex-col items-center sm:w-48 lg:w-44 xl:w-40"
              >
                <div className="flex h-12 items-center justify-center sm:h-14">
                  <Image
                    alt={logo.name}
                    src={logo.src}
                    width={200}
                    height={80}
                    className="h-auto max-h-16 w-auto object-contain sm:max-h-20 lg:max-h-24"
                  />
                </div>
                {caseStudyUrl ? (
                  <Link
                    href={caseStudyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-mt-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Case study &rarr;
                  </Link>
                ) : (
                  <div className="h-4" />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Button
        variant="highlight"
        size="md"
        label="Join them"
        className="mt-8"
        onClick={() => {
          window.location.href = "/api/workos/login?screenHint=sign-up";
        }}
      />
    </div>
  );
}
