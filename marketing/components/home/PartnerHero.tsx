// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { Grid, H2, P } from "@marketing/components/home/ContentComponents";
import { HomeEyebrow } from "@marketing/components/home/content/Product/HomeEyebrow";
import { HomeReveal } from "@marketing/components/home/content/Product/HomeReveal";
import { classNames } from "@marketing/lib/utils";
import { Building01, Globe01, Icon, PuzzlePiece01 } from "@dust-tt/sparkle";
import Image from "next/image";
import type { ComponentType } from "react";

interface PartnerCard {
  icon: ComponentType;
  title: string;
  description: string;
}

const PARTNER_BENEFITS: { title: string; description: string }[] = [
  {
    title: "Revenue opportunity",
    description:
      "Attractive partner margins and recurring revenue from customer deployments.",
  },
  {
    title: "Dedicated support",
    description:
      "Technical onboarding, sales enablement, and partner success resources.",
  },
  {
    title: "Co-selling",
    description: "Joint go-to-market opportunities with our sales team.",
  },
];

const IDEAL_PARTNERS: PartnerCard[] = [
  {
    icon: Building01,
    title: "Service Partners",
    description:
      "Agencies and consultancies implementing AI solutions for clients.",
  },
  {
    icon: Globe01,
    title: "Resellers",
    description: "Technology resellers and VARs with B2B customer bases.",
  },
  {
    icon: PuzzlePiece01,
    title: "Systems Integrators",
    description: "Teams deploying enterprise software at scale.",
  },
];

interface PartnerLogo {
  name: string;
  src: string;
  // Transparent/dark wordmarks invert to white on the dark section. Set this to
  // false for self-contained color tiles that must be shown as-is (rendered as a
  // rounded tile rather than inverted).
  invertOnDark?: boolean;
  // Per-logo height cap for optical balancing (bolder marks read larger at the
  // same height, so they need a shorter cap).
  maxHClass?: string;
}

const PARTNER_LOGOS: PartnerLogo[] = [
  { name: "Wesype", src: "/static/landing/partners/wesype.png" },
  {
    name: "Niji",
    src: "/static/landing/partners/niji.svg",
    maxHClass: "max-h-7",
  },
  { name: "Devoteam", src: "/static/landing/partners/devoteam.png" },
  { name: "Artefact", src: "/static/landing/partners/artefact.png" },
  { name: "Humanskills", src: "/static/landing/partners/humanskills.svg" },
  { name: "Argon", src: "/static/landing/partners/argon.svg" },
  {
    name: "Deloitte",
    src: "/static/landing/partners/deloitte.svg",
    maxHClass: "max-h-6",
  },
];

// Curated brand accent trio (matches the homepage CTA stats). Applied by item
// index so both sections share the same blue → golden → green color language.
type Accent = "blue" | "golden" | "green";

const ACCENTS: Accent[] = ["blue", "golden", "green"];

const ACCENT_CHIP: Record<Accent, string> = {
  blue: "bg-blue-100 text-blue-500",
  golden: "bg-golden-100 text-golden-500",
  green: "bg-green-100 text-green-500",
};

const ACCENT_TEXT: Record<Accent, string> = {
  blue: "text-blue-500",
  golden: "text-golden-500",
  green: "text-green-500",
};

// Social proof for the dark closing section: white text and logos rendered as
// uniform white marks (brightness-0 invert) so they read on the near-black bg.
export function PartnerSocialProof() {
  return (
    <HomeReveal
      delay={320}
      className="mt-12 flex w-full flex-col items-center gap-8 border-t border-white/10 pt-12"
    >
      <p className="m-0 font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
        Join our growing network of partners
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8 lg:gap-x-16">
        {PARTNER_LOGOS.map((logo) => (
          <div
            key={logo.name}
            className="flex h-10 items-center justify-center opacity-80 transition-opacity duration-150 ease-in-out hover:opacity-100"
          >
            <Image
              alt={logo.name}
              src={logo.src}
              width={150}
              height={40}
              className={classNames(
                "h-auto w-auto object-contain",
                logo.maxHClass ?? "max-h-8",
                logo.invertOnDark === false
                  ? "rounded-md"
                  : "brightness-0 invert"
              )}
            />
          </div>
        ))}
      </div>
    </HomeReveal>
  );
}

export function PartnerIdealPartners() {
  return (
    <Grid gap="gap-x-8 gap-y-10 md:gap-y-12">
      <HomeReveal className="col-span-12 flex flex-col items-end gap-4 text-right lg:col-span-4 lg:col-start-9 lg:row-start-1">
        <HomeEyebrow label="Who we work with" />
        <H2 className="text-right">Ideal Partners</H2>
        <P size="md" className="text-muted-foreground">
          We work with teams that put AI to work for their clients.
        </P>
      </HomeReveal>
      <div className="col-span-12 flex flex-col gap-4 lg:col-span-7 lg:col-start-1 lg:row-start-1">
        {IDEAL_PARTNERS.map((partner, index) => (
          <HomeReveal
            key={partner.title}
            delay={index * 80}
            className="flex items-start gap-4 rounded-2xl bg-muted p-6 text-left"
          >
            <div
              className={classNames(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                ACCENT_CHIP[ACCENTS[index % ACCENTS.length]]
              )}
            >
              <Icon visual={partner.icon} className="h-5 w-5" size="sm" />
            </div>
            <div className="flex flex-col">
              <h4 className="text-lg font-semibold">{partner.title}</h4>
              <P size="sm" className="mt-1 text-muted-foreground">
                {partner.description}
              </P>
            </div>
          </HomeReveal>
        ))}
      </div>
    </Grid>
  );
}

export function PartnerHero() {
  return (
    <div className="flex flex-col gap-24 md:gap-32">
      {/* Hero heading */}
      <Grid>
        <div
          className={classNames(
            "flex flex-col items-center gap-5 pt-24 text-center",
            "col-span-12"
          )}
        >
          <HomeReveal>
            <h1 className="heading-5xl md:heading-6xl lg:heading-7xl">
              Become a Partner
            </h1>
          </HomeReveal>
          <HomeReveal delay={80} className="max-w-2xl">
            <P size="lg" className="text-balance text-muted-foreground">
              Bring AI agents to your clients as a Dust service partner,
              reseller, or implementation specialist.
            </P>
          </HomeReveal>
        </div>
      </Grid>

      {/* Why Partner with Dust */}
      <Grid gap="gap-x-8 gap-y-10 md:gap-y-12">
        <HomeReveal className="col-span-12 flex flex-col items-start gap-4 text-left lg:col-span-4">
          <HomeEyebrow label="Why Dust" />
          <H2 className="text-left">Why Partner with Dust?</H2>
          <P size="md" className="text-muted-foreground">
            A profitable, well-supported way to bring Dust to the teams you
            already serve.
          </P>
        </HomeReveal>
        <div className="col-span-12 flex flex-col lg:col-span-7 lg:col-start-6">
          {PARTNER_BENEFITS.map((benefit, index) => (
            <HomeReveal
              key={benefit.title}
              delay={index * 80}
              className="flex flex-col gap-2 border-t border-border py-6 text-left first:border-t-0 first:pt-0"
            >
              <span
                className={classNames(
                  "text-sm font-semibold tabular-nums",
                  ACCENT_TEXT[ACCENTS[index % ACCENTS.length]]
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h4 className="text-lg font-semibold">{benefit.title}</h4>
              <P size="sm" className="text-muted-foreground">
                {benefit.description}
              </P>
            </HomeReveal>
          ))}
        </div>
      </Grid>
    </div>
  );
}
