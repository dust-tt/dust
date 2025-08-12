import { H2, P } from "@app/components/home/ContentComponents";

export function CapabilitySection() {
  return (
    <div className="w-full">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center sm:gap-2 sm:px-6 lg:px-8">
        <H2 className="text-3xl font-medium md:text-4xl lg:text-5xl">
          Tailor AI agents to your team needs
        </H2>
        <P size="lg" className="text-base text-muted-foreground sm:text-lg">
          Anyone on your team can create personalized agents.
        </P>
      </div>

      <div className="mt-16 flex flex-col gap-16 lg:gap-20">
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:gap-12">
          <div className="order-1 w-full lg:order-1 lg:w-1/2">
            <div className="flex flex-col gap-3 text-center lg:text-left">
              <H2 className="text-center text-2xl font-medium md:text-3xl lg:text-left lg:text-4xl">
                Build agents with custom instructions and tools
              </H2>
              <P
                size="md"
                className="text-center text-muted-foreground lg:text-left"
              >
                Adapt instructions to your needs, with pre-built templates.
                Empower agents with specialized tools for data extraction,
                transformations, or advanced operations.
              </P>
            </div>
          </div>
          <div className="order-2 w-full lg:order-2 lg:w-1/2">
            <div className="relative flex aspect-[5/3] items-center justify-center overflow-hidden rounded-2xl bg-rose-50">
              <div className="relative h-full w-full">
                <img
                  src="/static/landing/product/agents2.svg"
                  alt="Agents"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-8 lg:flex-row lg:gap-12">
          <div className="order-1 w-full lg:order-2 lg:w-1/2">
            <div className="flex flex-col gap-3 text-center lg:text-left">
              <H2 className="text-center text-2xl font-medium md:text-3xl lg:text-left lg:text-4xl">
                Feed your company context
              </H2>
              <P
                size="md"
                className="text-center text-muted-foreground lg:text-left"
              >
                Notion, Slack, GitHub, external websites (...) natively in
                minutes. Integrate anything via API.
              </P>
            </div>
          </div>
          <div className="order-2 w-full lg:order-1 lg:w-1/2">
            <div className="relative flex aspect-[5/3] items-center justify-center overflow-hidden rounded-2xl bg-green-50">
              <div className="relative h-full w-full">
                <img
                  src="/static/landing/product/connectors.svg"
                  alt="Connectors"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-16 flex flex-col gap-16 lg:gap-20">
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:gap-12">
          <div className="order-1 w-full lg:order-1 lg:w-1/2">
            <div className="flex flex-col gap-3 text-center lg:text-left">
              <H2 className="text-center text-2xl font-medium md:text-3xl lg:text-left lg:text-4xl">
                Leverage the best models on the market
              </H2>
              <P
                size="md"
                className="text-center text-muted-foreground lg:text-left"
              >
                Choose OpenAI, Anthropic, Gemini, Mistral, or any cutting-edge
                model to ensure your agents stay smartest.
              </P>
            </div>
          </div>
          <div className="order-2 w-full lg:order-2 lg:w-1/2">
            <div className="relative flex aspect-[5/3] items-center justify-center overflow-hidden rounded-2xl bg-golden-50">
              <div className="relative h-full w-full">
                <img
                  src="/static/landing/product/model.svg"
                  alt="Models"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-8 lg:flex-row lg:gap-12">
          <div className="order-1 w-full lg:order-2 lg:w-1/2">
            <div className="flex flex-col gap-3 text-center lg:text-left">
              <H2 className="text-center text-2xl font-medium md:text-3xl lg:text-left lg:text-4xl">
                Share with your team, collect feedback
              </H2>
              <P
                size="md"
                className="text-center text-muted-foreground lg:text-left"
              >
                Empower tinkerers to build agents for their teams and get
                continuous feedback to iterate on them.
              </P>
            </div>
          </div>
          <div className="order-2 w-full lg:order-1 lg:w-1/2">
            <div className="relative flex aspect-[5/3] items-center justify-center overflow-hidden rounded-2xl bg-blue-50">
              <div className="relative h-full w-full">
                <img
                  src="/static/landing/product/analytics.svg"
                  alt="Analytics"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
