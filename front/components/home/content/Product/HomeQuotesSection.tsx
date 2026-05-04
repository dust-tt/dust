// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { HomeQuoteMark } from "@app/components/home/content/Product/HomeQuoteMark";
import Image from "next/image";
import { useEffect, useState } from "react";

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

interface OutgoingState {
  idx: number;
  // 1 = next was clicked (outgoing exits LEFT, incoming enters from RIGHT)
  // -1 = prev was clicked (outgoing exits RIGHT, incoming enters from LEFT)
  direction: 1 | -1;
}

const SLIDE_DURATION_MS = 360;
// CSS keyframes for the carousel slide. Defined globally (per section render)
// via <style>; ease-out-cubic chosen because each slide is entering or
// exiting the viewport — the easing accelerates fast and decelerates into
// place, which reads as confident.
const SLIDE_CSS = `
@keyframes home-quote-slide-in-right {
  from { transform: translate3d(48px, 0, 0); opacity: 0; }
  to { transform: translate3d(0, 0, 0); opacity: 1; }
}
@keyframes home-quote-slide-in-left {
  from { transform: translate3d(-48px, 0, 0); opacity: 0; }
  to { transform: translate3d(0, 0, 0); opacity: 1; }
}
@keyframes home-quote-slide-out-left {
  from { transform: translate3d(0, 0, 0); opacity: 1; }
  to { transform: translate3d(-48px, 0, 0); opacity: 0; }
}
@keyframes home-quote-slide-out-right {
  from { transform: translate3d(0, 0, 0); opacity: 1; }
  to { transform: translate3d(48px, 0, 0); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .home-quote-slide { animation: none !important; }
}
`;

// Quote section per Figma node 3248:1478. Two-column layout: a light-blue
// panel with the testimonial as a 56px Geist semibold headline, attribution
// at the bottom-left, prev/next arrows at the bottom-right cycling through
// the quotes array. Photo of the speaker fills the right column.
//
// Carousel motion: when the user clicks an arrow, the outgoing quote slides
// off-screen (left for next, right for prev), and the incoming quote slides
// in from the opposite side. Quote-block, attribution, and photo all share
// the same animation timing/direction so the two columns feel like one
// motion (paired-elements rule).
export function HomeQuotesSection({ quotes }: HomeQuotesSectionProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [outgoing, setOutgoing] = useState<OutgoingState | null>(null);

  // Clear the outgoing slide once its exit animation completes — keeping it
  // in the DOM longer holds the card height to whichever quote is taller.
  useEffect(() => {
    if (!outgoing) {
      return;
    }
    const t = window.setTimeout(() => setOutgoing(null), SLIDE_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [outgoing]);

  if (quotes.length === 0) {
    return null;
  }
  const switchTo = (newIdx: number, direction: 1 | -1) => {
    if (outgoing || newIdx === activeIdx) {
      return; // ignore mid-animation clicks
    }
    setOutgoing({ idx: activeIdx, direction });
    setActiveIdx(newIdx);
  };
  const prev = () =>
    switchTo((activeIdx - 1 + quotes.length) % quotes.length, -1);
  const next = () => switchTo((activeIdx + 1) % quotes.length, 1);
  const hasMultiple = quotes.length > 1;
  const incomingAnim = outgoing
    ? outgoing.direction === 1
      ? "home-quote-slide-in-right"
      : "home-quote-slide-in-left"
    : null;
  const outgoingAnim = outgoing
    ? outgoing.direction === 1
      ? "home-quote-slide-out-left"
      : "home-quote-slide-out-right"
    : null;
  // Single shared animation string for incoming and outgoing slides — keeps
  // the four animated regions (two columns × in/out) perfectly synchronized.
  const animBase = `${SLIDE_DURATION_MS}ms cubic-bezier(0.215, 0.61, 0.355, 1) both`;

  const activeQuote = quotes[activeIdx];
  const outgoingQuote = outgoing ? quotes[outgoing.idx] : null;

  return (
    <section className="w-full bg-background py-24">
      <style dangerouslySetInnerHTML={{ __html: SLIDE_CSS }} />
      <div className="mx-auto w-full max-w-[1180px] px-6">
        <div className="flex flex-col items-stretch gap-4 lg:flex-row">
          <div className="flex flex-1 flex-col gap-8 rounded-2xl bg-blue-50 p-10 md:p-14 lg:gap-12">
            {/* Stack a ghost copy of every quote in the same grid cell so
                the cell always sizes to the tallest quote — the card height
                stays stable regardless of which quote is animating. The
                ghost copies are visually hidden (`invisible`) but still take
                layout space. The animated outgoing/incoming slides render
                in the same cell on top. */}
            <div className="grid overflow-hidden">
              {quotes.map((q) => (
                <div
                  key={`ghost-quote-${q.authorName}`}
                  className="invisible col-start-1 row-start-1 flex flex-col gap-2"
                  aria-hidden
                >
                  <QuoteContent quote={q} />
                </div>
              ))}
              {outgoingQuote && outgoingAnim && (
                <div
                  key={`out-quote-${outgoing?.idx}`}
                  className="home-quote-slide col-start-1 row-start-1 flex flex-col gap-2"
                  style={{ animation: `${outgoingAnim} ${animBase}` }}
                  aria-hidden
                >
                  <QuoteContent quote={outgoingQuote} />
                </div>
              )}
              <div
                key={`in-quote-${activeIdx}`}
                className="home-quote-slide col-start-1 row-start-1 flex flex-col gap-2"
                style={
                  incomingAnim
                    ? { animation: `${incomingAnim} ${animBase}` }
                    : undefined
                }
              >
                <QuoteContent quote={activeQuote} />
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="grid min-w-0 flex-1 overflow-hidden">
                {quotes.map((q) => (
                  <div
                    key={`ghost-name-${q.authorName}`}
                    className="invisible col-start-1 row-start-1 flex flex-col"
                    aria-hidden
                  >
                    <Attribution quote={q} />
                  </div>
                ))}
                {outgoingQuote && outgoingAnim && (
                  <div
                    key={`out-name-${outgoing?.idx}`}
                    className="home-quote-slide col-start-1 row-start-1 flex flex-col"
                    style={{ animation: `${outgoingAnim} ${animBase}` }}
                    aria-hidden
                  >
                    <Attribution quote={outgoingQuote} />
                  </div>
                )}
                <div
                  key={`in-name-${activeIdx}`}
                  className="home-quote-slide col-start-1 row-start-1 flex flex-col"
                  style={
                    incomingAnim
                      ? { animation: `${incomingAnim} ${animBase}` }
                      : undefined
                  }
                >
                  <Attribution quote={activeQuote} />
                </div>
              </div>
              {hasMultiple && (
                <div className="flex items-center gap-1">
                  <CarouselButton
                    direction="prev"
                    onClick={prev}
                    label="Previous quote"
                  />
                  <CarouselButton
                    direction="next"
                    onClick={next}
                    label="Next quote"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="relative aspect-[5/6] w-full overflow-hidden rounded-2xl bg-slate-200 lg:aspect-auto lg:w-[429px] lg:flex-shrink-0 lg:self-stretch">
            {outgoingQuote && outgoingAnim && (
              <div
                key={`out-photo-${outgoing?.idx}`}
                className="home-quote-slide absolute inset-0"
                style={{ animation: `${outgoingAnim} ${animBase}` }}
                aria-hidden
              >
                <Image
                  src={outgoingQuote.imageSrc}
                  alt={outgoingQuote.imageAlt}
                  fill
                  className="object-cover object-bottom"
                  sizes="(min-width: 1024px) 429px, 100vw"
                />
              </div>
            )}
            <div
              key={`in-photo-${activeIdx}`}
              className="home-quote-slide absolute inset-0"
              style={
                incomingAnim
                  ? { animation: `${incomingAnim} ${animBase}` }
                  : undefined
              }
            >
              <Image
                src={activeQuote.imageSrc}
                alt={activeQuote.imageAlt}
                fill
                className="object-cover object-bottom"
                sizes="(min-width: 1024px) 429px, 100vw"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function QuoteContent({ quote }: { quote: QuoteEntry }) {
  return (
    <>
      <HomeQuoteMark size={24} />
      <blockquote className="m-0 text-balance font-semibold leading-[1.2] tracking-[-0.018em] text-gray-900 text-[clamp(2rem,4vw,3.5rem)]">
        {quote.quote}
      </blockquote>
      <HomeQuoteMark className="self-end" size={24} />
    </>
  );
}

function Attribution({ quote }: { quote: QuoteEntry }) {
  return (
    <>
      <span className="text-lg font-semibold leading-[26px] tracking-[-0.36px] text-gray-900">
        {quote.authorName}
      </span>
      <span className="text-[15px] leading-[1.4] tracking-[-0.5px] text-gray-900/80">
        {quote.authorRole}
      </span>
    </>
  );
}

interface CarouselButtonProps {
  direction: "prev" | "next";
  onClick: () => void;
  label: string;
}

function CarouselButton({ direction, onClick, label }: CarouselButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-gray-900/30 bg-transparent text-gray-900 transition-colors duration-150 hover:bg-white"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {direction === "prev" ? (
          <polyline points="11 4 6 9 11 14" />
        ) : (
          <polyline points="7 4 12 9 7 14" />
        )}
      </svg>
    </button>
  );
}
