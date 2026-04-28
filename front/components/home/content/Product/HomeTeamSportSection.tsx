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
      <div className="mx-auto flex w-full max-w-[920px] flex-col items-center gap-10 px-6 text-center">
        <HomeReveal>
          <HomeEyebrow label="The platform for AI operators" />
        </HomeReveal>
        <HomeReveal delay={80}>
          <H2 className="text-balance text-center font-medium leading-[1.05] tracking-[-0.03em] text-foreground">
            AI that rewires your company, not just your to-do list.
          </H2>
        </HomeReveal>
        <HomeReveal delay={160}>
          <P
            size="sm"
            className="max-w-[680px] text-center leading-[1.6] text-muted-foreground"
          >
            AI is a team sport. AI Operators build agents and skills that
            immediately benefit their entire team. Sales builds something
            useful, Support is already using it by Tuesday. With Projects,
            people, agents, and context come together in shared hubs where
            intelligence compounds. Not single-player productivity; multiplayer
            AI for the enterprise.
          </P>
        </HomeReveal>
        <HomeReveal as="figure" delay={240} className="w-full">
          <div className="m-0 mx-auto mt-6 flex w-full max-w-[760px] flex-col gap-6 rounded-2xl bg-slate-950 p-6 text-left text-white sm:p-8">
            <HomeQuoteMark />
            <blockquote
              className="m-0 text-balance text-lg italic leading-[1.3] tracking-[-0.005em] text-white md:text-xl"
              style={{ fontFamily: SERIF_STACK }}
            >
              &ldquo;We made a bet on Dust because we knew the team was
              exceptional. What we didn&apos;t expect was how quickly it would
              transform how we work. Dust became the connective tissue that
              amplifies what each team does best.&rdquo;
            </blockquote>
            <figcaption className="flex items-center gap-3 not-italic">
              <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-slate-800">
                <Image
                  src="/static/landing/people/ryan-wang.png"
                  alt="Ryan Wang, CEO at Assembled"
                  fill
                  className="object-cover"
                  sizes="44px"
                />
              </div>
              <span className="flex flex-col">
                <span className="text-sm font-medium text-white">
                  Ryan Wang
                </span>
                <span className="text-xs text-white/65">CEO at Assembled</span>
              </span>
            </figcaption>
          </div>
        </HomeReveal>
      </div>
    </section>
  );
}
