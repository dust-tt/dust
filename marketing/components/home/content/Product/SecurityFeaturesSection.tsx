import { H2, P } from "@marketing/components/home/ContentComponents";
import { HomeReveal } from "@marketing/components/home/content/Product/HomeReveal";
import { ChevronUp, Separator } from "@dust-tt/sparkle";
import { useState } from "react";

interface SecurityFeature {
  id: string;
  title: string;
  description: string;
  placeholder: string;
}

const securityFeatures: SecurityFeature[] = [
  {
    id: "ingest",
    title: "Your data stays where you want it",
    description:
      "Choose EU or US hosting. Control exactly which data sources your agents can access. Your organization's intelligence stays yours, never used to train models.",
    placeholder: "Data Control Placeholder",
  },
  {
    id: "models",
    title: "Select trusted models only",
    description:
      "Choose from a curated list of enterprise-grade AI models that meet your security requirements.",
    placeholder: "Trusted Models Placeholder",
  },
  {
    id: "access",
    title: "Maintain rigorous access control",
    description:
      "Implement fine-grained permissions and authentication to protect your sensitive data.",
    placeholder: "Access Control Placeholder",
  },
];

export function SecurityFeaturesSection() {
  const [activeFeature, setActiveFeature] = useState<string>("ingest");

  return (
    <div className="w-full pt-16">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center sm:gap-2 lg:px-8">
        <HomeReveal>
          <H2
            className="text-center text-3xl font-medium md:text-4xl xl:text-5xl"
            style={{ textAlign: "center" }}
          >
            Built with enterprise-grade security
          </H2>
        </HomeReveal>
        <HomeReveal delay={80}>
          <P size="lg" className="text-base text-muted-foreground sm:text-lg">
            We've made security our core focus from day one.<br></br> SOC 2,
            HIPAA, GDPR, and full data sovereignty. Your data is never used to
            train models. Ship fast without your security team hitting the
            brakes.
          </P>
        </HomeReveal>
      </div>

      {/* Same container metrics as the CapabilitySection blocks. */}
      <div className="mx-auto flex w-full max-w-[1180px] flex-col items-center gap-12 py-14 lg:flex-row lg:gap-20 lg:px-6 lg:py-24">
        {/* Image - Above on mobile, left on desktop */}
        <HomeReveal
          variant="photo"
          delay={120}
          className="order-1 w-full lg:order-1 lg:w-1/2"
        >
          <div
            className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl ${
              activeFeature === "ingest"
                ? "bg-rose-50"
                : activeFeature === "models"
                  ? "bg-golden-50"
                  : activeFeature === "access"
                    ? "bg-green-50"
                    : "bg-gray-50"
            }`}
          >
            <div className="relative h-full w-full">
              {activeFeature === "ingest" && (
                <img
                  src="/static/landing/product/data.svg"
                  alt="Data Control"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              {activeFeature === "models" && (
                <img
                  src="/static/landing/home/team-sport-collab.svg"
                  alt="Model Selection"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              {activeFeature === "access" && (
                <img
                  src="/static/landing/product/member.svg"
                  alt="Access Control"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
          </div>
        </HomeReveal>

        {/* Accordion - Below on mobile, right on desktop */}
        <HomeReveal
          delay={80}
          className="order-2 w-full lg:order-2 lg:flex lg:w-1/2 lg:items-center"
        >
          <div className="flex w-full flex-col items-center lg:items-start">
            {securityFeatures.map((feature) => {
              const isActive = activeFeature === feature.id;
              return (
                <div key={feature.id} className="w-full">
                  <button
                    className="flex w-full items-center justify-between py-6 text-left focus:outline-hidden"
                    onClick={() => setActiveFeature(feature.id)}
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
