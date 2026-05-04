// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { H2, P } from "@app/components/home/ContentComponents";
import { HomeEyebrow } from "@app/components/home/content/Product/HomeEyebrow";
import { HomeQuoteMark } from "@app/components/home/content/Product/HomeQuoteMark";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";
import Image from "next/image";

const SERIF_STACK = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';

export function HomeTeamSportSection() {
  return (
    <section className="w-full bg-background py-24">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col px-6">
        {/* Two-column layout: copy + Ryan Wang pull-quote on the left,
            collaboration illustration on the right. Mirrors the
            HomeCoordinatedSection layout. */}
        <div className="flex flex-col items-stretch gap-12 lg:flex-row lg:items-center lg:gap-20">
          <div className="flex w-full flex-col gap-6 lg:w-1/2">
            <HomeReveal>
              <HomeEyebrow label="The platform for AI operators" />
            </HomeReveal>
            <HomeReveal delay={80}>
              <H2 className="text-balance font-semibold leading-[1.08] tracking-[-0.03em] text-foreground">
                AI that rewires your company, not just your to-do list.
              </H2>
            </HomeReveal>
            <HomeReveal delay={160}>
              <P
                size="sm"
                className="max-w-[480px] leading-[1.6] text-muted-foreground"
              >
                AI is a team sport. AI Operators build agents and skills that
                immediately benefit their entire team. Sales builds something
                useful, Support is already using it by Tuesday. With Projects,
                people, agents, and context come together in shared hubs where
                intelligence compounds. Not single-player productivity;
                multiplayer AI for the enterprise.
              </P>
            </HomeReveal>
            <HomeReveal as="figure" delay={240} className="m-0 mt-4 w-full">
              <div className="flex w-full max-w-[520px] flex-col gap-4 border-l-2 border-foreground/15 pl-5 text-left">
                <HomeQuoteMark />
                <blockquote
                  className="m-0 text-balance text-base italic leading-[1.4] tracking-[-0.005em] text-foreground md:text-lg"
                  style={{ fontFamily: SERIF_STACK }}
                >
                  &ldquo;We made a bet on Dust because we knew the team was
                  exceptional. What we didn&apos;t expect was how quickly it
                  would transform how we work. Dust became the connective tissue
                  that amplifies what each team does best.&rdquo;
                </blockquote>
                <figcaption className="flex items-center gap-3 not-italic">
                  <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                    <Image
                      src="/static/landing/people/ryan-wang.png"
                      alt="Ryan Wang, CEO at Assembled"
                      fill
                      className="object-cover"
                      sizes="36px"
                    />
                  </div>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      Ryan Wang
                    </span>
                    <span className="text-xs text-muted-foreground">
                      CEO at Assembled
                    </span>
                  </span>
                </figcaption>
              </div>
            </HomeReveal>
          </div>
          <HomeReveal
            variant="photo"
            delay={120}
            className="flex w-full justify-center self-stretch lg:w-1/2"
          >
            <div className="flex w-full max-w-[520px] items-center justify-center self-stretch rounded-3xl bg-blue-50 p-8">
              <Image
                src="/static/landing/home/team-sport-collab.png"
                alt="Dust collaboration: shared agent in a chat with named teammates and live cursors"
                width={560}
                height={560}
                className="m-auto h-auto w-full max-w-[420px] object-contain"
                priority={false}
              />
            </div>
          </HomeReveal>
        </div>
      </div>
    </section>
  );
}
