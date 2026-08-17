import { H2 } from "@marketing/components/home/ContentComponents";
import {
  HomeReveal,
  HomeRevealStyles,
} from "@marketing/components/home/content/Product/HomeReveal";

export function CapabilitySection() {
  return (
    <div className="w-full">
      <HomeRevealStyles />
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen">
        <HomeReveal>
          <div className="relative flex w-full flex-col items-center gap-12 overflow-hidden bg-[#1c91ff] pt-16 md:pt-24">
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
              <H2 className="text-center text-3xl font-medium text-white md:text-4xl xl:text-5xl">
                The AI system built for
                <br />
                your whole organization
              </H2>
              <img
                src="/static/landing/product/Product%20screen%201.svg"
                alt="Dust chat interface with conversation history, projects, and an agent ready to help"
                className="w-full max-w-[1040px]"
              />
            </div>
          </div>
        </HomeReveal>
      </div>
    </div>
  );
}
