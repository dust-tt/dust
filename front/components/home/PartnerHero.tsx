import { Grid, H1, H2, P } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";
import {
  CardIcon,
  ChatBubbleLeftRightIcon,
  CompanyIcon,
  GlobeAltIcon,
  HeartIcon,
  Icon,
  PuzzleIcon,
} from "@dust-tt/sparkle";
import Image from "next/image";
import type { ComponentType } from "react";

type ColorVariant = "blue" | "green" | "golden" | "rose";

const BENEFIT_COLORS: Record<ColorVariant, { card: string; icon: string }> = {
  blue: { card: "bg-blue-50", icon: "text-blue-400" },
  green: { card: "bg-green-50", icon: "text-green-400" },
  golden: { card: "bg-golden-50", icon: "text-golden-400" },
  rose: { card: "bg-rose-50", icon: "text-rose-400" },
};

const PARTNER_BENEFITS: {
  icon: ComponentType;
  title: string;
  description: string;
  color: ColorVariant;
}[] = [
  {
    icon: CardIcon,
    title: "Revenue opportunity",
    description:
      "Attractive partner margins and recurring revenue from customer deployments.",
    color: "green",
  },
  {
    icon: HeartIcon,
    title: "Dedicated support",
    description:
      "Technical onboarding, sales enablement, and partner success resources.",
    color: "blue",
  },
  {
    icon: ChatBubbleLeftRightIcon,
    title: "Co-selling",
    description: "Joint go-to-market opportunities with our sales team.",
    color: "rose",
  },
];

const IDEAL_PARTNERS: {
  icon: ComponentType;
  title: string;
  description: string;
  color: ColorVariant;
}[] = [
  {
    icon: CompanyIcon,
    title: "Service Partners",
    description:
      "Agencies and consultancies implementing AI solutions for clients.",
    color: "blue",
  },
  {
    icon: GlobeAltIcon,
    title: "Resellers",
    description: "Technology resellers and VARs with B2B customer bases.",
    color: "golden",
  },
  {
    icon: PuzzleIcon,
    title: "Systems Integrators",
    description: "Teams deploying enterprise software at scale.",
    color: "green",
  },
];

const PARTNER_LOGOS = [
  { name: "Wesype", src: "/static/landing/partners/wesype.png" },
  { name: "Niji", src: "/static/landing/partners/niji.webp" },
  { name: "Devoteam", src: "/static/landing/partners/devoteam.png" },
];

const COL_CLASSES = classNames(
  "col-span-12",
  "lg:col-span-8 lg:col-start-2",
  "xl:col-span-8 xl:col-start-2",
  "2xl:col-start-3"
);

export function PartnerSocialProof() {
  return (
    <Grid>
      <div
        className={classNames(COL_CLASSES, "flex flex-col items-center gap-6")}
      >
        <P size="md" className="text-center text-muted-foreground">
          Join our growing network of partners helping businesses deploy AI
          agents.
        </P>
        <div className="flex flex-wrap items-center justify-center gap-8">
          {PARTNER_LOGOS.map((logo) => (
            <div
              key={logo.name}
              className="flex h-10 items-center justify-center"
            >
              <Image
                alt={logo.name}
                src={logo.src}
                width={120}
                height={40}
                className="h-auto max-h-8 w-auto object-contain grayscale"
              />
            </div>
          ))}
        </div>
      </div>
    </Grid>
  );
}

export function PartnerIdealPartners() {
  return (
    <Grid>
      <div className={COL_CLASSES}>
        <H2 className="mb-8">Ideal Partners</H2>
        <div className="grid gap-4 sm:grid-cols-3 lg:gap-6">
          {IDEAL_PARTNERS.map((partner) => {
            const colors = BENEFIT_COLORS[partner.color];
            return (
              <div
                key={partner.title}
                className={classNames(
                  "flex flex-col rounded-2xl p-6",
                  colors.card
                )}
              >
                <Icon
                  visual={partner.icon}
                  className={classNames("mb-4 h-8 w-8", colors.icon)}
                  size="md"
                />
                <h4 className="text-lg font-semibold">{partner.title}</h4>
                <P size="sm" className="mt-1 text-muted-foreground">
                  {partner.description}
                </P>
              </div>
            );
          })}
        </div>
      </div>
    </Grid>
  );
}

export function PartnerHero() {
  return (
    <div className="flex flex-col gap-20">
      {/* Hero heading */}
      <Grid>
        <div
          className={classNames(
            "flex flex-col justify-end gap-6 pt-24",
            "col-span-12",
            "sm:col-span-12 md:col-span-12",
            "lg:col-span-8 lg:col-start-2",
            "xl:col-span-8 xl:col-start-2",
            "2xl:col-start-3"
          )}
        >
          <H1
            mono
            className="text-5xl font-medium leading-tight md:text-6xl lg:text-7xl"
          >
            Become a Partner
          </H1>
          <P size="lg" className="text-muted-foreground">
            Partner with Dust to bring AI agents to your clients. We&apos;re
            building a network of service partners, resellers, and
            implementation specialists who deploy Dust across their customer
            base.
          </P>
        </div>
      </Grid>

      {/* Why Partner with Dust */}
      <Grid>
        <div className={COL_CLASSES}>
          <H2 className="mb-8">Why Partner with Dust?</H2>
          <div className="grid gap-4 sm:grid-cols-3 lg:gap-6">
            {PARTNER_BENEFITS.map((benefit) => {
              const colors = BENEFIT_COLORS[benefit.color];
              return (
                <div
                  key={benefit.title}
                  className={classNames(
                    "flex flex-col rounded-2xl p-6",
                    colors.card
                  )}
                >
                  <Icon
                    visual={benefit.icon}
                    className={classNames("mb-4 h-8 w-8", colors.icon)}
                    size="md"
                  />
                  <h4 className="text-lg font-semibold">{benefit.title}</h4>
                  <P size="sm" className="mt-1 text-muted-foreground">
                    {benefit.description}
                  </P>
                </div>
              );
            })}
          </div>
        </div>
      </Grid>
    </div>
  );
}
