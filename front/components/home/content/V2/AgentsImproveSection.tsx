import { H2, P } from "@app/components/home/ContentComponents";

const CAPABILITY_CARDS = [
  {
    icon: "📚",
    title: "Knows your company",
    description:
      "Connects to all your tools and data sources. Context flows automatically.",
    bg: "bg-amber-100",
  },
  {
    icon: "🤝",
    title: "AI is a team sport",
    description:
      "Built for collaboration across departments. One builds, everyone benefits.",
    bg: "bg-blue-100",
  },
  {
    icon: "⚡",
    title: "Always the best model",
    description:
      "Switch between OpenAI, Anthropic, Google, Mistral. Always use what's best.",
    bg: "bg-emerald-100",
  },
  {
    icon: "📈",
    title: "Compounds across the org",
    description:
      "Value grows with every team that joins. Skills spread, intelligence compounds.",
    bg: "bg-rose-100",
  },
];

const SOURCES = [
  "Slack",
  "Salesforce",
  "Notion",
  "GitHub",
  "Zendesk",
  "Linear",
];

export function AgentsImproveSection() {
  return (
    <section className="py-16 lg:py-24">
      <div className="rounded-3xl bg-emerald-50/50 p-8 md:p-12 lg:p-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-700">
          🔄 How Dust Agents Improve with You
        </p>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-8">
            <div>
              <H2 mono className="mb-6 text-left">
                Agents that understand how you work and get smarter
                over&nbsp;time.
              </H2>
              <P size="lg" className="text-muted-foreground">
                Dust agents don&rsquo;t just search your data; your teams encode
                how you work in agents. With Skills and reinforcement
                capabilities, agents learn and evolve through repeated use. Best
                practices consolidate into shared skills, improvements spread to
                every agent automatically, and your fiftieth workflow is easier to
                build than your fifth.
              </P>
            </div>

            <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <p className="mb-4 italic leading-relaxed text-muted-foreground">
                &ldquo;We used to do the work. Now we build the agents that do
                it.&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-700">
                  SK
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Shashank Khanna
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Founder in Residence, GTM Innovation at Vanta
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700">
                  ~400h saved/week
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CAPABILITY_CARDS.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-border bg-white p-6 shadow-sm"
              >
                <div
                  className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-lg ${card.bg}`}
                >
                  {card.icon}
                </div>
                <h4 className="mb-2 font-semibold text-foreground">
                  {card.title}
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {card.description}
                </p>
              </div>
            ))}

            <div className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:col-span-2">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Connected Sources
              </p>
              <div className="grid grid-cols-3 gap-3">
                {SOURCES.map((source) => (
                  <div
                    key={source}
                    className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2"
                  >
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-medium text-foreground">
                      {source}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-xs text-muted-foreground">Agent Memory</p>
                <p className="text-sm text-foreground">
                  Remembers context from{" "}
                  <span className="font-semibold">847</span> past conversations
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
