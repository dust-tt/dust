// Shared definition of the homepage hero A/B experiment.
//
// Imported by BOTH the server (flag evaluation in `getServerSideProps`) and the
// client (hero rendering + exposure tracking), so this module must stay free of
// server-only imports (`posthog-node`, `fs`, request objects, ...).
//
// The variant is resolved server-side against the PostHog multivariate feature
// flag `home-hero-experiment` and rendered into the initial HTML, so visitors
// never see the control copy flash to the test copy.

export const HERO_EXPERIMENT_FLAG_KEY = "home-hero-experiment";

export type HeroVariantKey = "control" | "collaboration";

export const HERO_VARIANT_KEYS: readonly HeroVariantKey[] = [
  "control",
  "collaboration",
] as const;

export const DEFAULT_HERO_VARIANT: HeroVariantKey = "control";

export interface HeroContent {
  headlineLine1: string;
  headlineLine2: string;
  leadCopy: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  // When set, the hero's right column plays this customer-story clip instead of
  // the animated office scene.
  heroVideo?: { youtubeId: string; title: string };
}

export const HERO_CONTENT: Record<HeroVariantKey, HeroContent> = {
  control: {
    headlineLine1: "Multiplayer AI for",
    headlineLine2: "human-agent collaboration.",
    leadCopy:
      "Dust is where people and agents collaborate as co-contributors, so that work doesn't just get done – it gets rewired.",
    primaryCtaLabel: "Request a demo",
    secondaryCtaLabel: "Try for free →",
  },
  collaboration: {
    headlineLine1: "The best teams aren't just using AI.",
    headlineLine2: "They're running it.",
    leadCopy:
      "Dust gives your whole organization shared context, smarter agents, and AI that actually knows your business.",
    primaryCtaLabel: "Request a demo",
    secondaryCtaLabel: "Try for free →",
    // Laurel customer story:
    // /customers/how-laurel-runs-like-a-400-person-company-with-a-100-person-team-using-dust
    heroVideo: {
      youtubeId: "FHbleyDAtEk",
      title: "How Laurel runs like a 400-person company with Dust",
    },
  },
};

// Narrow an arbitrary PostHog flag value (multivariate string, boolean, or
// undefined when evaluation fails) down to a known hero variant, falling back
// to control for anything unexpected.
export function toHeroVariant(value: unknown): HeroVariantKey {
  return (
    HERO_VARIANT_KEYS.find((key) => key === value) ?? DEFAULT_HERO_VARIANT
  );
}

// Type guard for an explicit, valid variant key. Unlike toHeroVariant() this
// does NOT coerce unknown values to control — use it when you need to know a
// caller genuinely asked for a specific variant (e.g. a dev preview override).
export function isHeroVariantKey(value: unknown): value is HeroVariantKey {
  return HERO_VARIANT_KEYS.some((key) => key === value);
}
