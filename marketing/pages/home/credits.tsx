// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
import { classNames } from "@marketing/lib/utils";
import {
  AnthropicLogo,
  ChevronDown,
  cn,
  DeepseekLogo,
  GeminiLogo,
  GrokLogo,
  MistralLogo,
  MoonshotLogo,
  OpenaiLogo,
  ZaiLogo,
} from "@dust-tt/sparkle";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useRouter } from "next/router";
import type React from "react";
import type { ReactElement } from "react";
import { useState } from "react";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

// ---------- Types ----------

interface ModelCreditRow {
  model: string;
  inputCreditsPerMTokens: string;
  outputCreditsPerMTokens: string;
}

interface ProviderSection {
  provider: string;
  Logo: React.ComponentType<{ className?: string }>;
  rows: ModelCreditRow[];
}

// ---------- Data ----------

const PROVIDER_SECTIONS: ProviderSection[] = [
  {
    provider: "OpenAI",
    Logo: OpenaiLogo,
    rows: [
      {
        model: "GPT 5",
        inputCreditsPerMTokens: "148",
        outputCreditsPerMTokens: "1,177",
      },
      {
        model: "GPT 5.1",
        inputCreditsPerMTokens: "148",
        outputCreditsPerMTokens: "1,177",
      },
      {
        model: "GPT 5.2",
        inputCreditsPerMTokens: "206",
        outputCreditsPerMTokens: "1,648",
      },
      {
        model: "GPT 5.4",
        inputCreditsPerMTokens: "295",
        outputCreditsPerMTokens: "1,765",
      },
      {
        model: "GPT 5.5",
        inputCreditsPerMTokens: "589",
        outputCreditsPerMTokens: "3,530",
      },
      {
        model: "GPT 5.6 Luna",
        inputCreditsPerMTokens: "118",
        outputCreditsPerMTokens: "706",
      },
      {
        model: "GPT 5.6 Sol",
        inputCreditsPerMTokens: "589",
        outputCreditsPerMTokens: "3,530",
      },
      {
        model: "GPT 5.6 Terra",
        inputCreditsPerMTokens: "295",
        outputCreditsPerMTokens: "1,765",
      },
      {
        model: "GPT-5 Mini",
        inputCreditsPerMTokens: "30",
        outputCreditsPerMTokens: "236",
      },
      {
        model: "GPT-5 Nano",
        inputCreditsPerMTokens: "6",
        outputCreditsPerMTokens: "48",
      },
      {
        model: "GPT-5.4 Mini",
        inputCreditsPerMTokens: "89",
        outputCreditsPerMTokens: "530",
      },
      {
        model: "GPT-5.4 Nano",
        inputCreditsPerMTokens: "24",
        outputCreditsPerMTokens: "148",
      },
    ],
  },
  {
    provider: "Anthropic",
    Logo: AnthropicLogo,
    rows: [
      {
        model: "Claude 4.5 Haiku",
        inputCreditsPerMTokens: "118",
        outputCreditsPerMTokens: "589",
      },
      {
        model: "Claude Fable 5",
        inputCreditsPerMTokens: "1,177",
        outputCreditsPerMTokens: "5,883",
      },
      {
        model: "Claude Opus 4.6",
        inputCreditsPerMTokens: "589",
        outputCreditsPerMTokens: "2,942",
      },
      {
        model: "Claude Opus 4.7",
        inputCreditsPerMTokens: "589",
        outputCreditsPerMTokens: "2,942",
      },
      {
        model: "Claude Opus 4.8",
        inputCreditsPerMTokens: "589",
        outputCreditsPerMTokens: "2,942",
      },
      {
        model: "Claude Opus 5",
        inputCreditsPerMTokens: "589",
        outputCreditsPerMTokens: "2,942",
      },
      {
        model: "Claude Sonnet 4.6",
        inputCreditsPerMTokens: "353",
        outputCreditsPerMTokens: "1,765",
      },
      {
        model: "Claude Sonnet 5",
        inputCreditsPerMTokens: "236",
        outputCreditsPerMTokens: "1,177",
      },
    ],
  },
  {
    provider: "DeepSeek",
    Logo: DeepseekLogo,
    rows: [
      {
        model: "DeepSeek V4 Pro, Fireworks",
        inputCreditsPerMTokens: "205",
        outputCreditsPerMTokens: "410",
      },
    ],
  },
  {
    provider: "Z.ai",
    Logo: ZaiLogo,
    rows: [
      {
        model: "GLM-5.2, Fireworks",
        inputCreditsPerMTokens: "165",
        outputCreditsPerMTokens: "518",
      },
    ],
  },
  {
    provider: "Moonshot AI",
    Logo: MoonshotLogo,
    rows: [
      {
        model: "Kimi K2.5, Fireworks",
        inputCreditsPerMTokens: "71",
        outputCreditsPerMTokens: "353",
      },
      {
        model: "Kimi K2.6, Fireworks",
        inputCreditsPerMTokens: "112",
        outputCreditsPerMTokens: "471",
      },
    ],
  },
  {
    provider: "Google",
    Logo: GeminiLogo,
    rows: [
      {
        model: "Gemini 3.1 Flash Lite",
        inputCreditsPerMTokens: "30",
        outputCreditsPerMTokens: "177",
      },
      {
        model: "Gemini 3.1 Pro",
        inputCreditsPerMTokens: "471",
        outputCreditsPerMTokens: "2,118",
      },
      {
        model: "Gemini 3.5 Flash",
        inputCreditsPerMTokens: "177",
        outputCreditsPerMTokens: "1,059",
      },
    ],
  },
  {
    provider: "Mistral",
    Logo: MistralLogo,
    rows: [
      {
        model: "Mistral Codestral",
        inputCreditsPerMTokens: "106",
        outputCreditsPerMTokens: "330",
      },
      {
        model: "Mistral Large",
        inputCreditsPerMTokens: "236",
        outputCreditsPerMTokens: "706",
      },
      {
        model: "Mistral Medium 3.5",
        inputCreditsPerMTokens: "177",
        outputCreditsPerMTokens: "883",
      },
      {
        model: "Mistral Small",
        inputCreditsPerMTokens: "106",
        outputCreditsPerMTokens: "330",
      },
    ],
  },
  {
    provider: "xAI",
    Logo: GrokLogo,
    rows: [
      {
        model: "Grok 4.5",
        inputCreditsPerMTokens: "236",
        outputCreditsPerMTokens: "706",
      },
    ],
  },
];

// ---------- Subcomponents ----------

function Hero() {
  return (
    <section className="-mx-6 flex flex-col items-center px-4 pt-6 text-center md:mx-0 md:px-0 md:pt-10 lg:pt-14">
      <h1
        className={classNames(
          "heading-5xl md:heading-6xl lg:heading-7xl",
          "mb-5 max-w-3xl text-balance text-foreground"
        )}
      >
        Dust credits
      </h1>
      <p className="copy-lg mb-9 max-w-2xl text-balance text-muted-foreground">
        These are intelligence credits only, excluding separate action credits.
        The figures are rounded up per model and execution, matching the
        codebase conversion logic.
      </p>
    </section>
  );
}

function ModelCreditsTable() {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(PROVIDER_SECTIONS.map((s) => [s.provider, true]))
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
        {PROVIDER_SECTIONS.map((section) => {
          const isOpen = openSections[section.provider] ?? true;
          const Logo = section.Logo;
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
                      <Logo className="h-6 w-6 flex-shrink-0" />
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
                    <motion.tr
                      key={`${section.provider}:${row.model}`}
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
                          {row.model}
                        </span>
                      </td>
                      <td className="block px-2 pb-3.5 pt-1.5 text-center align-middle tabular-nums md:table-cell md:w-[240px] md:px-5 md:py-3.5 md:pt-3.5">
                        <span className="copy-sm text-foreground">
                          {row.inputCreditsPerMTokens}
                        </span>
                      </td>
                      <td className="block px-2 pb-3.5 pt-1.5 text-center align-middle tabular-nums md:table-cell md:w-[240px] md:px-5 md:py-3.5 md:pt-3.5">
                        <span className="copy-sm text-foreground">
                          {row.outputCreditsPerMTokens}
                        </span>
                      </td>
                    </motion.tr>
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
export default function Credits() {
  const router = useRouter();

  return (
    <MotionConfig reducedMotion="user">
      <PageMetadata
        title="Dust Credits: Model Credit Consumption"
        description="Intelligence credit consumption per model on Dust, in credits per million input and output tokens."
        pathname={router.asPath}
      />
      <Hero />
      <ModelCreditsTable />
    </MotionConfig>
  );
}

Credits.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
