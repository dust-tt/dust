import { H2, P } from "@app/components/home/ContentComponents";

const ACTIVITY_STEPS = [
  {
    color: "bg-blue-400",
    title: "Zendesk ticket received",
    detail: "Customer: Acme Corp · Priority: High",
    pulse: true,
  },
  {
    color: "bg-amber-400",
    title: "Agent classifies & drafts response",
    detail: "Category: Billing · Sentiment: Frustrated",
    pulse: true,
  },
  {
    color: "bg-emerald-400",
    title: "CRM updated automatically",
    detail: "Salesforce · Contact record synced",
    pulse: true,
  },
  {
    color: "bg-emerald-600",
    title: "Reply sent to customer",
    detail: "Via Zendesk · Resolution time: 2m 14s",
    pulse: false,
  },
];

export function HowAgentsWorkSection() {
  return (
    <section className="py-16 lg:py-24">
      <div className="rounded-3xl bg-amber-50/50 p-8 md:p-12 lg:p-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-amber-700">
          ✦ How Dust Agents Work
        </p>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-8">
            <div>
              <H2 mono className="mb-6 text-left">
                Turn scattered knowledge and tools into coordinated execution.
              </H2>
              <P size="lg" className="text-muted-foreground">
                Your team runs on dozens of tools and knowledge sources operating
                in isolation. Dust connects across all of them, pulling the right
                context from the right source and taking action in the right
                place, at the right time. Not a chatbot sitting on top of your
                stack — a coordination layer running through it.
              </P>
            </div>

            <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <p className="mb-4 italic leading-relaxed text-muted-foreground">
                &ldquo;Dust is the most impactful software we&rsquo;ve adopted
                since building Clay. It delivers immediate value while
                continuously getting smarter and more valuable over time.&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                  EB
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Everett Berry
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Head of GTM Engineering at Clay
                  </p>
                </div>
                <div className="ml-auto flex gap-2">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    100% adoption
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    58h saved/mo
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start justify-center">
            <div className="w-full max-w-md rounded-2xl border border-border bg-white shadow-sm">
              <div className="border-b border-border/50 px-6 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Live Agent Activity
                </p>
              </div>
              <div className="flex flex-col gap-4 p-6">
                {ACTIVITY_STEPS.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${step.color} ${step.pulse ? "animate-pulse" : ""}`}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
