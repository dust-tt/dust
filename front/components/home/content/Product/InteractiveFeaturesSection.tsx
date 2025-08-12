import { ChevronUpIcon, Separator } from "@dust-tt/sparkle";
import { useState } from "react";

import { H2, P } from "@app/components/home/ContentComponents";

interface FeatureItem {
  id: string;
  title: string;
  description: string;
  placeholder: string;
}

const features: FeatureItem[] = [
  {
    id: "browser",
    title: "Use in your browser",
    description:
      "Access Dust wherever you work via our Chrome extension—no app-switching required.",
    placeholder: "Browser Extension Placeholder",
  },
  {
    id: "connections",
    title: "Build custom connections",
    description:
      "Create custom integrations with your existing tools and APIs.",
    placeholder: "Custom Connections Placeholder",
  },
  {
    id: "integrations",
    title: "Build custom integrations",
    description: "Connect Dust to your internal systems and workflows.",
    placeholder: "Custom Integrations Placeholder",
  },
  {
    id: "tools",
    title: "Build custom agentic tools",
    description: "Extend your agents with custom tools and capabilities.",
    placeholder: "Custom Tools Placeholder",
  },
  {
    id: "access",
    title: "Access from your tools",
    description:
      "Integrate Dust directly into your existing development environment.",
    placeholder: "Tool Access Placeholder",
  },
  {
    id: "workflows",
    title: "Add to workflows",
    description:
      "Automate complex workflows with Dust agents and custom logic.",
    placeholder: "Workflow Integration Placeholder",
  },
];

export function InteractiveFeaturesSection() {
  const [activeFeature, setActiveFeature] = useState<string>("browser");

  return (
    <div className="w-full">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center sm:gap-2 sm:px-6 lg:px-8">
        <H2 className="text-3xl font-medium md:text-4xl lg:text-5xl">
          Push further with custom code
        </H2>
        <P size="lg" className="text-base text-muted-foreground sm:text-lg">
          Developer friendly platform designed to build custom actions and
          application orchestration to fit your team's exact needs.
        </P>
      </div>

      <div className="mt-16 flex flex-col gap-8 lg:flex-row lg:items-stretch lg:gap-12">
        {/* Image - Above on mobile, right on desktop */}
        <div className="order-1 w-full lg:order-2 lg:w-1/2">
          <div
            className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl ${
              activeFeature === "browser"
                ? "bg-rose-50"
                : activeFeature === "connections"
                  ? "bg-golden-50"
                  : activeFeature === "integrations"
                    ? "bg-green-50"
                    : activeFeature === "tools"
                      ? "bg-gray-50"
                      : activeFeature === "access"
                        ? "bg-blue-50"
                        : activeFeature === "workflows"
                          ? "bg-purple-50"
                          : "bg-gray-50"
            }`}
          >
            <div className="relative h-full min-h-[200px] w-full lg:min-h-0">
              {activeFeature === "browser" && (
                <img
                  src="/static/landing/product/extensionCRM.svg"
                  alt="Browser Extension"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              )}
              {activeFeature === "connections" && (
                <img
                  src="/static/landing/product/connectors.svg"
                  alt="Custom Connections"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              )}
              {activeFeature === "integrations" && (
                <img
                  src="/static/landing/product/slack-incident.svg"
                  alt="Custom Integrations"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              )}
              {activeFeature === "tools" && (
                <img
                  src="/static/landing/product/support.svg"
                  alt="Custom Tools"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              )}
              {activeFeature === "access" && (
                <img
                  src="/static/landing/product/slack-ticket.svg"
                  alt="Tool Access"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              )}
              {activeFeature === "workflows" && (
                <img
                  src="/static/landing/product/zendesk-dust.svg"
                  alt="Workflow Integration"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              )}
            </div>
          </div>
        </div>

        {/* Accordion - Below on mobile, left on desktop */}
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
