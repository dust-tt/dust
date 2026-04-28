import { H2, P } from "@app/components/home/ContentComponents";

import styles from "./CollaborationSection.module.css";

function CursorTag({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className: string;
}) {
  return (
    <div className={`pointer-events-none absolute z-10 ${className}`}>
      <div
        className={`flex items-center gap-1 rounded-full ${color} px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-lg`}
      >
        <svg className="h-2.5 w-2.5" viewBox="0 0 10 10">
          <polygon points="0,0 10,4 2,6" fill="white" />
        </svg>
        {name}
      </div>
    </div>
  );
}

export function CollaborationSection() {
  return (
    <section className="py-16 lg:py-24">
      <div className="rounded-3xl bg-blue-50/50 p-8 md:p-12 lg:p-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-blue-700">
          👥 How Your Team Collaborates with Dust
        </p>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: Collaboration visual */}
          <div className="flex items-center justify-center">
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-white shadow-lg">
              {/* Canvas header */}
              <div className="flex items-center justify-between border-b border-border/50 px-6 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="relative h-2 w-2">
                    <div
                      className={`h-2 w-2 rounded-full bg-emerald-400 ${styles.livePing}`}
                    />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Live — Q2 Deal Pipeline
                  </p>
                </div>
                <div className="flex -space-x-1.5">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-[8px] font-bold text-white">
                    M
                  </div>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 text-[8px] font-bold text-white">
                    S
                  </div>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-[8px] font-bold text-white">
                    P
                  </div>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-600">
                    <div className="flex gap-0.5">
                      <div className="h-1 w-1 rounded-full bg-white" />
                      <div className="h-1 w-1 rounded-full bg-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Animated message feed */}
              <div
                className={`relative space-y-2.5 p-5 ${styles.canvasLoop}`}
                style={{ minHeight: 460 }}
              >
                {/* Sarah → Marcus (Human ↔ Human) */}
                <div
                  className={`rounded-xl border border-rose-100 bg-rose-50 p-3.5 ${styles.msgAppear}`}
                  style={{ animationDelay: "0.3s" }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-700">
                      SA
                    </div>
                    <div>
                      <p className="mb-0.5 text-[10px] font-semibold text-rose-600">
                        Sarah · Sales
                      </p>
                      <p className="text-xs leading-relaxed text-foreground">
                        <span className="font-semibold text-blue-700">
                          @Marcus
                        </span>{" "}
                        I built a Deal Prep agent that pulls from Salesforce +
                        call transcripts. Try it on the Acme renewal — saved me
                        2h this week.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Marcus → Agent (Human ↔ Agent) */}
                <div
                  className={`rounded-xl border border-blue-100 bg-blue-50 p-3.5 ${styles.msgAppear}`}
                  style={{ animationDelay: "1.8s" }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-200 text-[10px] font-bold text-blue-700">
                      MA
                    </div>
                    <div>
                      <p className="mb-0.5 text-[10px] font-semibold text-blue-600">
                        Marcus · RevOps
                      </p>
                      <p className="text-xs leading-relaxed text-foreground">
                        <span className="font-semibold text-emerald-700">
                          @Deal Prep Agent
                        </span>{" "}
                        Run full analysis on Acme Corp renewal — include
                        competitor intel and expansion signals.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Deal Prep Agent response */}
                <div
                  className={`rounded-xl border border-border bg-gray-50 p-3.5 ${styles.msgAppear}`}
                  style={{ animationDelay: "3.5s" }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                      <div className="h-2 w-2 rounded-full bg-white" />
                    </div>
                    <div className="flex-1">
                      <p className="mb-1.5 text-[10px] font-semibold text-emerald-700">
                        Deal Prep Agent
                      </p>
                      <div className="space-y-1.5 text-xs leading-relaxed text-foreground">
                        <p>
                          ✓ Pulled 14 Salesforce records + 3 Gong transcripts
                        </p>
                        <p>
                          ✓ Key risk: champion left in Q1. New contact
                          identified.
                        </p>
                        <p className={styles.handoffPulse}>
                          ☞ Handing off to{" "}
                          <span className="font-semibold text-purple-700">
                            @Competitive Intel Agent
                          </span>
                          …
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Competitive Intel Agent (Agent ↔ Agent) */}
                <div
                  className={`rounded-xl border border-purple-100 bg-purple-50 p-3.5 ${styles.msgAppear}`}
                  style={{ animationDelay: "5.5s" }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-600 text-white">
                      <div className="h-2 w-2 rounded-full bg-white" />
                    </div>
                    <div className="flex-1">
                      <p className="mb-1.5 text-[10px] font-semibold text-purple-700">
                        Competitive Intel Agent
                      </p>
                      <div className="space-y-1.5 text-xs leading-relaxed text-foreground">
                        <p>
                          ✓ Battlecard generated: Acme vs. 3 competitors
                        </p>
                        <p>
                          ✓ Pricing intel updated from latest G2 reviews
                        </p>
                        <p>
                          ☞ Notifying{" "}
                          <span className="font-semibold text-blue-700">
                            @Marcus
                          </span>{" "}
                          and{" "}
                          <span className="font-semibold text-rose-700">
                            @Sarah
                          </span>{" "}
                          — ready for review
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Animated cursors */}
                <CursorTag
                  name="Sarah"
                  color="bg-rose-500"
                  className={`right-8 top-16 ${styles.cursorSarah}`}
                />
                <CursorTag
                  name="Marcus"
                  color="bg-blue-500"
                  className={`left-6 top-32 ${styles.cursorMarcus}`}
                />
                <CursorTag
                  name="Priya"
                  color="bg-amber-500"
                  className={`bottom-8 right-12 ${styles.cursorPriya}`}
                />
              </div>

              {/* Legend bar */}
              <div className="flex items-center gap-5 border-t border-border/50 px-5 py-2.5 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="flex -space-x-1">
                    <div className="h-3 w-3 rounded-full border border-white bg-rose-300" />
                    <div className="h-3 w-3 rounded-full border border-white bg-blue-300" />
                  </div>
                  Human ↔ Human
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex -space-x-1">
                    <div className="h-3 w-3 rounded-full border border-white bg-blue-300" />
                    <div className="h-3 w-3 rounded-lg border border-white bg-emerald-400" />
                  </div>
                  Human ↔ Agent
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex -space-x-1">
                    <div className="h-3 w-3 rounded-lg border border-white bg-emerald-400" />
                    <div className="h-3 w-3 rounded-lg border border-white bg-purple-400" />
                  </div>
                  Agent ↔ Agent
                </div>
              </div>
            </div>
          </div>

          {/* Right: text + quote */}
          <div className="flex flex-col gap-8">
            <div>
              <H2 mono className="mb-6 text-left">
                Anyone can build sophisticated AI agents in minutes. The real
                power? Everyone else gets to use them.
              </H2>
              <P size="lg" className="text-muted-foreground">
                AI is a team sport. AI Operators build agents and skills that
                immediately benefit their entire team. Sales builds something
                useful, Support is already using it by Tuesday. With Projects,
                people, agents, and context come together in shared hubs where
                intelligence compounds. Not single-player productivity —
                multiplayer AI for the enterprise.
              </P>
            </div>

            <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <p className="mb-4 italic leading-relaxed text-muted-foreground">
                &ldquo;We made a bet on Dust because we knew the team was
                exceptional. What we didn&rsquo;t expect was how quickly it would
                transform how we work. Dust became the connective tissue that
                amplifies what each team does best.&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                  RW
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Ryan Wang
                  </p>
                  <p className="text-xs text-muted-foreground">
                    CEO at Assembled
                  </p>
                </div>
                <div className="ml-auto flex gap-2">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    95% adoption
                  </span>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    120+ employees
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
