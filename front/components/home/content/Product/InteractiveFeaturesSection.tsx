import { ChevronUpIcon, Separator } from "@dust-tt/sparkle";
import { useState } from "react";

import { H2, P } from "@app/components/home/ContentComponents";

interface FeatureItem {
  id: string;
  title: string;
  description: string;
}

const features: FeatureItem[] = [
  {
    id: "connections",
    title: "Build custom connections",
    description:
      "Create custom integrations with your existing tools and APIs.",
  },
  {
    id: "integrations",
    title: "Build custom integrations",
    description:
      "Connect Dust to your internal systems and workflows, such as Slack, GitHub, Notion and more.",
  },
  {
    id: "tools",
    title: "Build custom agentic tools",
    description:
      "Extend your agents with custom tools such as semantic search, SQL queries, data visualization, and more.",
  },
  {
    id: "access",
    title: "Access from your tools",
    description:
      "Integrate Dust directly into your existing development environment.",
  },
  {
    id: "workflows",
    title: "Add to workflows",
    description:
      "Automate complex workflows with Dust agents like multi-step processes, data orchestration, and more.",
  },
];

const getBackgroundColor = (activeFeature: string) => {
  switch (activeFeature) {
    case "connections":
      return "bg-golden-50";
    case "integrations":
      return "bg-green-50";
    case "tools":
      return "bg-gray-50";
    case "access":
      return "bg-blue-50";
    case "workflows":
      return "bg-purple-50";
    default:
      return "bg-gray-50";
  }
};

const getImageSrc = (activeFeature: string) => {
  switch (activeFeature) {
    case "connections":
      return "/static/landing/product/connectors.svg";
    case "integrations":
      return "/static/landing/product/slack-incident.svg";
    case "tools":
      return "/static/landing/product/support.svg";
    case "access":
      return "/static/landing/product/slack-ticket.svg";
    case "workflows":
      return "/static/landing/product/zendesk-dust.svg";
    default:
      return "";
  }
};

const getImageAlt = (activeFeature: string) => {
  switch (activeFeature) {
    case "connections":
      return "Custom Connections";
    case "integrations":
      return "Custom Integrations";
    case "tools":
      return "Custom Tools";
    case "access":
      return "Tool Access";
    case "workflows":
      return "Workflow Integration";
    default:
      return "";
  }
};

export function InteractiveFeaturesSection() {
  const [activeFeature, setActiveFeature] = useState<string>("connections");

  return (
    <div className="w-full">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center sm:gap-2 sm:px-6 lg:px-8">
        <H2 className="text-center text-3xl font-medium md:text-4xl xl:text-5xl">
          Extend your capabilities
        </H2>
        <P size="lg" className="text-base text-muted-foreground sm:text-lg">
          Sometimes you need to build something specific. We get it. <br />
          Code your own tools and integrations without breaking everything else.
        </P>
      </div>

      <div className="mt-16 flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12">
        <div className="order-1 w-full lg:order-2 lg:w-1/2">
          <div
            className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl ${getBackgroundColor(activeFeature)}`}
          >
            <div className="flex h-full w-full items-center justify-center">
              <img
                src={getImageSrc(activeFeature)}
                alt={getImageAlt(activeFeature)}
                className="h-auto max-h-full w-auto max-w-full object-contain"
              />
            </div>
          </div>
        </div>

        <div className="order-2 w-full lg:order-1 lg:w-1/2">
          <div className="w-full">
            {features.map((feature) => {
              const isActive = activeFeature === feature.id;
              return (
                <div key={feature.id} className="w-full">
                  <button
                    className="flex w-full items-center justify-between py-6 text-left focus:outline-none"
                    onClick={() => setActiveFeature(feature.id)}
                    aria-expanded={isActive}
                  >
                    <span className="text-lg font-medium text-foreground dark:text-foreground-night">
                      {feature.title}
                    </span>
                    <span
                      className={`ml-6 flex h-6 w-6 flex-shrink-0 items-center justify-center text-muted-foreground transition-transform duration-200 dark:text-muted-foreground-night ${
                        isActive ? "rotate-180" : "rotate-0"
                      }`}
                    >
                      <ChevronUpIcon className="h-5 w-5" />
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
                        <div className="prose prose-gray max-w-none text-base leading-relaxed text-gray-600 dark:text-gray-400">
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
        </div>
      </div>
    </div>
  );
}
