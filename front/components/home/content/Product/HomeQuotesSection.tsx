// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { HomeQuoteMark } from "@app/components/home/content/Product/HomeQuoteMark";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";
import Image from "next/image";

interface QuoteEntry {
  quote: string;
  authorName: string;
  authorRole: string;
  imageSrc: string;
  imageAlt: string;
}

interface HomeQuotesSectionProps {
  quotes: QuoteEntry[];
}

export function HomeQuotesSection({ quotes }: HomeQuotesSectionProps) {
  return (
    <section className="w-full bg-slate-950 py-32">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-16 px-6">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-12 xl:gap-20">
          {quotes.map((q, idx) => {
            const columnDelay = idx * 120;
            return (
              <figure
                key={q.authorName}
                className="m-0 flex flex-col gap-8 text-white"
              >
                <HomeReveal
                  variant="photo"
                  delay={columnDelay}
                  className="relative aspect-[5/4] w-full overflow-hidden rounded-2xl bg-slate-800"
                >
                  <Image
                    src={q.imageSrc}
                    alt={q.imageAlt}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 50vw, 100vw"
                  />
                </HomeReveal>
                <HomeReveal delay={columnDelay + 200}>
                  <HomeQuoteMark />
                </HomeReveal>
                <HomeReveal as="span" delay={columnDelay + 300}>
                  <blockquote
                    className="m-0 block text-balance font-serif text-2xl italic leading-[1.25] tracking-[-0.01em] text-white md:text-3xl xl:text-[2.25rem]"
                    style={{
                      fontFamily:
                        'ui-serif, Georgia, Cambria, "Times New Roman", serif',
                    }}
                  >
                    &ldquo;{q.quote}&rdquo;
                  </blockquote>
                </HomeReveal>
                <HomeReveal
                  as="figure"
                  delay={columnDelay + 500}
                  className="m-0 block"
                >
                  <figcaption className="flex flex-col gap-1 not-italic">
                    <div className="text-base font-medium text-white">
                      {q.authorName}
                    </div>
                    <div className="text-sm text-white/70">{q.authorRole}</div>
                  </figcaption>
                </HomeReveal>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
