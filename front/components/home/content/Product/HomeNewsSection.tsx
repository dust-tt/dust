// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { H2 } from "@app/components/home/ContentComponents";
import { HomeEyebrow } from "@app/components/home/content/Product/HomeEyebrow";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";
import Link from "next/link";

interface NewsItem {
  source: string;
  title: string;
  date: string;
  href: string;
}

const NEWS: NewsItem[] = [
  {
    source: "VIBESCALING PODCAST",
    title:
      "How We Built Profound’s GTM Motion To A $1B+ Valuation w/ Mark Ebert, SVP of Revenue @ Profound",
    date: "May 12, 2026",
    href: "https://youtu.be/iDF_On2kOxo",
  },
  {
    source: "HYPERTEXT",
    title: "What is ARR anyway?",
    date: "Apr 17, 2026",
    href: "https://hypertext.fyi/what-is-arr-anyway/",
  },
  {
    source: "WING VC",
    title: "Enterprise Tech 30 List 2026",
    date: "Mar 31, 2026",
    href: "https://www.wing.vc/et30/list",
  },
  {
    source: "VENTUREBEAT",
    title:
      "Dust hits $6M ARR helping enterprises build AI agents that actually do stuff instead of just talking",
    date: "Jul 3, 2025",
    href: "https://venturebeat.com/ai/dust-hits-6m-arr-helping-enterprises-build-ai-agents-that-actually-do-stuff-instead-of-just-talking",
  },
  {
    source: "SEQUOIA CAPITAL",
    title: "Partnering with Dust: LLM-Powered Productivity",
    date: "Jul 3, 2023",
    href: "https://sequoiacap.com/article/partnering-with-dust-llm-powered-productivity/",
  },
];

const SEE_ALL_PRESS_HREF = "/home/about";

// News & press section per Figma node 3554:4468, conformed to the page's
// section conventions (bg-background, py-24, max-w-1180). Quiet editorial
// list with hover delight: outlet color cycles through the Dust palette,
// chevron slides in on hover, title nudges right, border accents under.
export function HomeNewsSection() {
  return (
    <section className="w-full bg-background py-24">
      <div className="mx-auto w-full max-w-[1180px] px-6">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
          <div className="flex flex-col gap-4 lg:w-[380px] lg:flex-shrink-0">
            <HomeReveal>
              <HomeEyebrow label="In the press" />
            </HomeReveal>
            <HomeReveal delay={80}>
              <H2 className="text-balance font-semibold leading-[1.08] tracking-[-0.03em] text-foreground">
                News and announcements
              </H2>
            </HomeReveal>
            <HomeReveal delay={160}>
              <Link
                href={SEE_ALL_PRESS_HREF}
                className="group inline-flex w-fit items-center gap-2 text-base font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
              >
                More about us
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-200 ease-out group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  <line x1="3" y1="8" x2="13" y2="8" />
                  <polyline points="9 4 13 8 9 12" />
                </svg>
              </Link>
            </HomeReveal>
          </div>
          <ul className="flex w-full min-w-0 flex-1 flex-col">
            {NEWS.map((item, index) => (
              <li key={item.title}>
                <HomeReveal delay={Math.min(index, 3) * 80}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-6 border-b border-border py-5 transition-[border-color,transform] duration-300 ease-out hover:border-foreground/30 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase leading-[16px] tracking-[0.04em]">
                        <span className="text-blue-800">{item.source}</span>
                        <span aria-hidden className="text-muted-foreground/60">
                          ·
                        </span>
                        <span className="text-muted-foreground transition-colors duration-300 ease-out group-hover:text-foreground/70 motion-reduce:transition-none">
                          {item.date}
                        </span>
                      </div>
                      <span className="text-base font-medium leading-[24px] tracking-[-0.01em] text-foreground transition-transform duration-300 ease-out group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:transform-none md:text-lg md:leading-[26px] md:tracking-[-0.36px]">
                        {item.title}
                      </span>
                    </div>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="-translate-x-2 flex-shrink-0 text-foreground/60 opacity-0 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:text-foreground group-hover:opacity-100 motion-reduce:translate-x-0 motion-reduce:transition-none"
                      aria-hidden="true"
                    >
                      <line x1="3" y1="9" x2="14" y2="9" />
                      <polyline points="10 4 15 9 10 14" />
                    </svg>
                  </a>
                </HomeReveal>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
