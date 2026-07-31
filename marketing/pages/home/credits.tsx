// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
import type { PublicModelCredit } from "@marketing/lib/api/model_credits";
import { fetchPublicModelCredits } from "@marketing/lib/api/model_credits";
import {
  AnthropicLogo,
  ChevronDown,
  cn,
  DeepseekLogo,
  GeminiLogo,
  GrokLogo,
  MinimaxLogo,
  MistralLogo,
  MoonshotLogo,
  OpenaiLogo,
  ZaiLogo,
} from "@dust-tt/sparkle";
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  m,
  MotionConfig,
} from "framer-motion";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import type React from "react";
import type { ReactElement } from "react";
import { useState } from "react";

interface CreditsPageProps {
  gtmTrackingId: string | null;
  providerSections: ProviderSection[];
}

// Server-rendered (like /integrations) rather than statically generated:
// a build-time getStaticProps would call the live API at `next build` time,
// which fails whenever this page ships before the API endpoint it depends
// on has been deployed.
export const getServerSideProps: GetServerSideProps<
  CreditsPageProps
> = async () => {
  const models = await fetchPublicModelCredits();

  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      providerSections: groupByModelMaker(models),
    },
  };
};

// ---------- Types ----------

interface ProviderSection {
  provider: string;
  modelMaker: string;
  rows: PublicModelCredit[];
}

// ---------- Data ----------

const LOGO_BY_MODEL_MAKER: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  openai: OpenaiLogo,
  anthropic: AnthropicLogo,
  mistral: MistralLogo,
  google_ai_studio: GeminiLogo,
  deepseek: DeepseekLogo,
  xai: GrokLogo,
  zai: ZaiLogo,
  moonshot: MoonshotLogo,
  minimax: MinimaxLogo,
};

function groupByModelMaker(models: PublicModelCredit[]): ProviderSection[] {
  const sectionByMaker = new Map<string, ProviderSection>();

  for (const model of models) {
    let section = sectionByMaker.get(model.modelMaker);
    if (!section) {
      section = {
        provider: model.modelMakerDisplayName,
        modelMaker: model.modelMaker,
        rows: [],
      };
      sectionByMaker.set(model.modelMaker, section);
    }
    section.rows.push(model);
  }

  const sections = Array.from(sectionByMaker.values());
  for (const section of sections) {
    section.rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  sections.sort((a, b) => a.provider.localeCompare(b.provider));

  return sections;
}

// ---------- Subcomponents ----------

function Hero() {
  return (
    <section className="-mx-6 flex flex-col items-center px-4 pt-6 text-center md:mx-0 md:px-0 md:pt-10 lg:pt-14">
      <h1
        className={cn(
          "heading-5xl md:heading-6xl lg:heading-7xl",
          "mb-5 max-w-3xl text-balance text-foreground"
        )}
      >
        Dust token credits
      </h1>
      <p className="copy-lg mb-9 max-w-2xl text-balance text-muted-foreground">
        These are token credits only, excluding action credits. The figures are
        rounded up per model and execution.
      </p>
    </section>
  );
}

interface ModelCreditsTableProps {
  providerSections: ProviderSection[];
}

function ModelCreditsTable({ providerSections }: ModelCreditsTableProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(providerSections.map((s) => [s.provider, true]))
  );

  const toggleSection = (provider: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [provider]: !(prev[provider] ?? true),
    }));
  };

  return (
    <section className="-mx-6 px-3 py-8 md:mx-0 md:px-0 md:py-12">
      <table className="mx-auto w-full max-w-3xl border-separate border-spacing-0">
        {/* top-16 matches the ScrollingHeader scrolled height (h-16). */}
        <thead className="sticky top-16 z-10">
          <tr className="grid grid-cols-2 bg-background md:table-row">
            <th className="hidden border-b border-border bg-background px-2 py-4 text-left align-bottom md:table-cell md:py-5">
              <span className="heading-lg text-foreground">Model</span>
            </th>
            <th className="block border-b border-border bg-background px-3 py-4 text-center align-bottom md:table-cell md:w-[240px] md:px-5 md:py-5">
              <span className="heading-sm text-foreground">
                Input credits / 1M tokens
              </span>
            </th>
            <th className="block border-b border-border bg-background px-3 py-4 text-center align-bottom md:table-cell md:w-[240px] md:px-5 md:py-5">
              <span className="heading-sm text-foreground">
                Output credits / 1M tokens
              </span>
            </th>
          </tr>
        </thead>
        {providerSections.map((section) => {
          const isOpen = openSections[section.provider] ?? true;
          const Logo = LOGO_BY_MODEL_MAKER[section.modelMaker] ?? null;
          return (
            <tbody
              key={section.provider}
              // Row-dim on hover, gated to hover-capable devices to avoid
              // sticky hover on touch.
              className="motion-safe:[&_tr[data-row=model]]:transition-opacity motion-safe:[&_tr[data-row=model]]:duration-200 [@media(hover:hover)]:[&:has(tr[data-row=model]:hover)_tr[data-row=model]:not(:hover)]:opacity-40"
            >
              <tr className="grid grid-cols-1 md:table-row">
                <th
                  colSpan={3}
                  scope="colgroup"
                  className="block border-t border-border p-0 text-left md:table-cell"
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.provider)}
                    aria-expanded={isOpen}
                    className="group flex w-full items-center justify-between gap-2 px-2 py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <span className="flex items-center gap-3">
                      {Logo && <Logo className="h-6 w-6 flex-shrink-0" />}
                      <span className="heading-2xl font-semibold text-foreground">
                        {section.provider}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-5 w-5 text-muted-foreground transition-transform duration-200",
                        !isOpen && "-rotate-90"
                      )}
                    />
                  </button>
                </th>
              </tr>
              <AnimatePresence initial={false}>
                {isOpen &&
                  section.rows.map((row, idx) => (
                    <m.tr
                      key={`${section.provider}:${row.modelId}`}
                      data-row="model"
                      className={cn(
                        "grid grid-cols-2 md:table-row",
                        idx % 2 === 1 && "bg-muted/40"
                      )}
                      initial={{ y: -4 }}
                      animate={{ y: 0 }}
                      transition={{
                        duration: 0.18,
                        ease: [0.215, 0.61, 0.355, 1],
                      }}
                    >
                      <td className="col-span-2 block px-2 pb-1.5 pt-3.5 align-middle md:table-cell md:py-3.5 md:pb-3.5">
                        <span className="copy-sm block max-w-[560px] font-medium text-foreground">
                          {row.displayName}
                        </span>
                      </td>
                      <td className="block px-2 pb-3.5 pt-1.5 text-center align-middle tabular-nums md:table-cell md:w-[240px] md:px-5 md:py-3.5 md:pt-3.5">
                        <span className="copy-sm text-foreground">
                          {row.inputCreditsPerMTokens.toLocaleString("en-US")}
                        </span>
                      </td>
                      <td className="block px-2 pb-3.5 pt-1.5 text-center align-middle tabular-nums md:table-cell md:w-[240px] md:px-5 md:py-3.5 md:pt-3.5">
                        <span className="copy-sm text-foreground">
                          {row.outputCreditsPerMTokens.toLocaleString("en-US")}
                        </span>
                      </td>
                    </m.tr>
                  ))}
              </AnimatePresence>
            </tbody>
          );
        })}
      </table>
    </section>
  );
}

// ---------- Page ----------

// biome-ignore lint/plugin/nextjsPageComponentNaming: matches pricing page pattern
export default function Credits({ providerSections }: CreditsPageProps) {
  const router = useRouter();

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <PageMetadata
          title="Dust Token Credits: Model Credit Consumption"
          description="Token credit consumption per model on Dust, in credits per million input and output tokens."
          pathname={router.asPath}
        />
        <Hero />
        <ModelCreditsTable providerSections={providerSections} />
      </MotionConfig>
    </LazyMotion>
  );
}

Credits.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
