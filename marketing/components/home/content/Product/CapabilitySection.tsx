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
  // When set, an autoplaying looped video replaces the image.
  videoSrc?: string;
  panelBg: string;
  // true = image on the left, text on the right (homepage layout).
  reverse: boolean;
}

const BLOCKS: CapabilityBlock[] = [
  {
    title: "Multiplayer AI, built for your whole team.",
    description: (
      <>
        Knowledge, skills, agents and memory compound across your organization.
        Humans and agents coordinate complex, cross-functional work, with shared
        intelligence that grows over time.
      </>
    ),
    imageSrc: "/static/landing/product/models.svg",
    imageAlt: "Models",
    panelBg: "bg-golden-50",
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
    videoSrc: "/static/landing/home/features/best-model.mp4",
    panelBg: "bg-blue-50",
    reverse: true,
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
    imageSrc: "/static/landing/product/govern-ai-usage.svg",
    imageAlt: "Agent analytics panel",
    panelBg: "bg-blue-50",
    reverse: false,
  },
];

export function CapabilitySection() {
  return (
    <div className="w-full">
      <HomeRevealStyles />
      <div className="mx-auto w-full max-w-[1180px] lg:px-6">
        <HomeReveal>
          <div className="relative flex w-full flex-col items-center gap-12 overflow-hidden rounded-2xl bg-[#1c91ff] pt-16 md:pt-24">
            <img
              src="/static/landing/product/ai-system-panel-pattern.png"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-contain"
            />
            <img
              src="/static/landing/product/ai-system-panel-texture.png"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="relative z-10 flex w-full flex-col items-center gap-8 px-6">
              <H2
                className="text-center text-3xl font-medium text-white md:text-4xl xl:text-5xl"
                style={{ textAlign: "center" }}
              >
                The AI system built for
                <br />
                your whole organization
              </H2>
              <img
                src="/static/landing/product/Product%20screen%201.svg"
                alt="Dust chat interface with conversation history, projects, and an agent ready to help"
                className="w-full max-w-[800px]"
              />
            </div>
          </div>
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
                  className={`relative aspect-square w-full max-w-[520px] overflow-hidden rounded-3xl ${block.panelBg}`}
                >
                  {block.videoSrc ? (
                    <video
                      src={block.videoSrc}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <img
                      src={block.imageSrc}
                      alt={block.imageAlt}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
              </HomeReveal>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
