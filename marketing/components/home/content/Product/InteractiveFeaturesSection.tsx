import { H2, P } from "@marketing/components/home/ContentComponents";
import { HomeReveal } from "@marketing/components/home/content/Product/HomeReveal";
import { ChevronUp, Separator } from "@dust-tt/sparkle";
import { useState } from "react";

interface FeatureItem {
  id: string;
  title: string;
  description: string;
}

const features: FeatureItem[] = [
  {
    id: "pods",
    title: "Pods",
    description:
      "Persistent shared workspace where humans and agents collaborate around any topic, project, or initiative. Shared conversations, tasks, files and agents, all in one place.",
  },
  {
    id: "skill",
    title: "Self-improving skill",
    description:
      "Skills that get smarter with every use. As your team runs agents, the system learns and improves, compounding your organization's intelligence over time without any manual effort.",
  },
  {
    id: "computer",
    title: "Computer",
    description:
      "Give your agents a real computer. Read and write files, run code, and process any data, inside an isolated Linux environment, scoped to each conversation",
  },
];

const getBackgroundColor = (activeFeature: string | null) => {
  switch (activeFeature) {
    case "pods":
      return "bg-golden-50";
    case "skill":
      return "bg-green-50";
    case "computer":
      return "bg-blue-50";
    default:
      return "bg-gray-50";
  }
};

const getImageSrc = (activeFeature: string | null) => {
  switch (activeFeature) {
    case "pods":
      return "/static/landing/product/connectors.svg";
    case "skill":
      return "/static/landing/product/support.svg";
    case "computer":
      return "/static/landing/product/zendesk-dust.svg";
    default:
      return "";
  }
};

const getImageAlt = (activeFeature: string | null) => {
  switch (activeFeature) {
    case "pods":
      return "Pods";
    case "skill":
      return "Self-improving skill";
    case "computer":
      return "Computer";
    default:
      return "";
  }
};

export function InteractiveFeaturesSection() {
  const [activeFeature, setActiveFeature] = useState<string | null>("pods");

  return (
    <div className="w-full">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center sm:gap-2 lg:px-8">
        <HomeReveal>
          <H2
            className="text-center text-3xl font-medium md:text-4xl xl:text-5xl"
            style={{ textAlign: "center" }}
          >
            Capabilities built for AI Operator
          </H2>
        </HomeReveal>
        <HomeReveal delay={80}>
          <P size="lg" className="text-base text-muted-foreground sm:text-lg">
            The fastest-moving companies don&apos;t just use AI. They run it.
            Dust gives AI Operators the capabilities to build, deploy and
            improve AI across their entire organization.
          </P>
        </HomeReveal>
      </div>

      {/* Same container metrics as the CapabilitySection blocks. */}
      <div className="mx-auto flex w-full max-w-[1180px] flex-col items-center gap-12 py-14 lg:flex-row lg:gap-20 lg:px-6 lg:py-24">
        <HomeReveal
          variant="photo"
          delay={120}
          className="order-1 w-full lg:order-2 lg:w-1/2"
        >
          <div
            className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl ${getBackgroundColor(activeFeature)}`}
          >
            <div className="flex h-full w-full items-center justify-center">
              {activeFeature && (
                <img
                  src={getImageSrc(activeFeature)}
                  alt={getImageAlt(activeFeature)}
                  className="h-auto max-h-full w-auto max-w-full object-contain"
                />
              )}
            </div>
          </div>
        </HomeReveal>

        <HomeReveal delay={80} className="order-2 w-full lg:order-1 lg:w-1/2">
          <div className="w-full">
            {features.map((feature) => {
              const isActive = activeFeature === feature.id;
              return (
                <div key={feature.id} className="w-full">
                  <button
                    className="flex w-full items-center justify-between py-6 text-left focus:outline-hidden"
                    onClick={() =>
                      setActiveFeature((prev) =>
                        prev === feature.id ? null : feature.id
                      )
                    }
                    aria-expanded={isActive}
                  >
                    <span className="text-lg font-medium text-foreground">
                      {feature.title}
                    </span>
                    <span
                      className={`ml-6 flex h-6 w-6 flex-shrink-0 items-center justify-center text-muted-foreground transition-transform duration-200 ${
                        isActive ? "rotate-180" : "rotate-0"
                      }`}
                    >
                      <ChevronUp className="h-5 w-5" />
                    </span>
                  </button>
                  <div
                    className={`grid overflow-hidden transition-all duration-300 ease-in-out ${
                      isActive
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="pb-6">
                        <div className="prose prose-gray max-w-none text-base leading-relaxed text-gray-600">
                          {feature.description}
                        </div>
                      </div>
                    </div>
                  </div>
                  <Separator className="my-0" />
                </div>
              );
            })}
          </div>
        </HomeReveal>
      </div>
    </div>
  );
}
