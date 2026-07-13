import { H2, P } from "@marketing/components/home/ContentComponents";
import {
  HomeReveal,
  HomeRevealStyles,
} from "@marketing/components/home/content/Product/HomeReveal";

interface CapabilityBlock {
  title: React.ReactNode;
  description: React.ReactNode;
  imageSrc: string;
  imageAlt: string;
  panelBg: string;
  // true = image on the left, text on the right (homepage layout).
  reverse: boolean;
}

const BLOCKS: CapabilityBlock[] = [
  {
    title: "Give every agent your full company context",
    description: (
      <>
        Connect Notion, Slack, Salesforce, Google Drive and more. Every agent
        knows what your company knows, and acts on it in real time.
      </>
    ),
    imageSrc: "/static/landing/product/agents2.svg",
    imageAlt: "Agents",
    panelBg: "bg-rose-50",
    reverse: false,
  },
  {
    title: (
      <>
        Use any model, connect securely to any system, flexible model routing.
      </>
    ),
    description: (
      <>
        Choose OpenAI, Anthropic, Gemini, Mistral or any frontier model. Connect
        securely to any system with flexible model routing. Your agents stay at
        the frontier.
      </>
    ),
    imageSrc: "/static/landing/product/connectors.svg",
    imageAlt: "Connectors",
    panelBg: "bg-green-50",
    reverse: true,
  },
  {
    title: "Multiplayer AI, built for your whole team.",
    description: (
      <>
        Knowledge, skills, agents and memory compound across your organization.
        Humans and agents coordinate complex, cross-functional work, with shared
        intelligence that grows over time.
      </>
    ),
    imageSrc: "/static/landing/product/model.svg",
    imageAlt: "Models",
    panelBg: "bg-golden-50",
    reverse: false,
  },
  {
    title: "Govern AI usage across your entire org",
    description: (
      <>
        Granular permissions, full observability, and performance and cost
        management. Dust gives companies the ability to govern responsible AI
        usage and maintain sovereignty over their organization&apos;s
        intelligence.
      </>
    ),
    imageSrc: "/static/landing/product/analytics.svg",
    imageAlt: "Analytics",
    panelBg: "bg-blue-50",
    reverse: true,
  },
];

export function CapabilitySection() {
  return (
    <div className="w-full">
      <HomeRevealStyles />
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center sm:gap-2 lg:px-8">
        <HomeReveal>
          <H2
            className="text-center text-3xl font-medium md:text-4xl xl:text-5xl"
            style={{ textAlign: "center" }}
          >
            The AI system built for your whole organization
          </H2>
        </HomeReveal>
        <HomeReveal delay={80}>
          <P size="lg" className="text-base text-muted-foreground sm:text-lg">
            From individual contributors to enterprise teams, Dust compounds
            your organizational intelligence over time.
          </P>
        </HomeReveal>
      </div>

      {/* Same block layout as HomeCoordinatedSection on the homepage. */}
      <div className="mt-4 flex flex-col">
        {BLOCKS.map((block) => (
          <section
            key={block.imageAlt}
            className="w-full bg-background py-14 lg:py-24"
          >
            <div
              className={`mx-auto flex w-full max-w-[1180px] flex-col items-center gap-12 lg:items-center lg:gap-20 lg:px-6 ${
                block.reverse ? "lg:flex-row-reverse" : "lg:flex-row"
              }`}
            >
              <div className="flex w-full flex-col gap-6 lg:w-1/2">
                <HomeReveal delay={80}>
                  <H2 className="text-balance font-semibold leading-[1.08] tracking-[-0.03em] text-foreground">
                    {block.title}
                  </H2>
                </HomeReveal>
                <HomeReveal delay={160}>
                  <P
                    size="sm"
                    className="max-w-[480px] leading-[1.6] text-muted-foreground"
                  >
                    {block.description}
                  </P>
                </HomeReveal>
              </div>
              <HomeReveal
                variant="photo"
                delay={120}
                className="flex w-full justify-center self-stretch lg:w-1/2"
              >
                <div
                  className={`flex w-full max-w-[520px] items-center justify-center self-stretch rounded-3xl p-8 ${block.panelBg}`}
                >
                  <img
                    src={block.imageSrc}
                    alt={block.imageAlt}
                    className="m-auto h-auto w-full max-w-[420px] object-contain"
                  />
                </div>
              </HomeReveal>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
