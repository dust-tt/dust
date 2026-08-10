import {
  Button,
  cn,
  Counter,
  Lightbulb04,
  MessagePlusCircle,
  NavigationList,
  NavigationListItem,
  Robot,
  ScrollArea,
  SearchInput,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

// Replica of front/components/assistant/conversation/SidebarMenu.tsx so the
// top-of-scroll blur can be tuned in isolation. The controls on the right map
// 1:1 to the Tailwind classes on the overlay; the readout at the bottom is the
// className to paste back into SidebarMenu.

const CONVERSATIONS = [
  "Outage banner sticky positioning",
  "Playground Manage Agent Skills",
  "Dark mode ContentMessage fix",
  "Sidebar scroll behaviour",
  "Agent builder model tooltips",
  "User memory skill instructions",
  "Swagger annotations lint",
  "Temporal worker retries",
  "Elasticsearch reindex plan",
  "Audit log schema sync",
  "Pod conversation summary",
  "Infinite scroll root margin",
  "Zendesk custom fields",
  "Notion connector backfill",
  "Slack thread ingestion",
  "Webhook source rotation",
  "Sandbox egress policy",
  "Frame view regressions",
  "Citation hover states",
  "Table virtualization",
];

interface SidebarProps {
  blurPx: number;
  heightPx: number;
  maskEndPct: number;
  tintPct: number;
}

function Sidebar({ blurPx, heightPx, maskEndPct, tintPct }: SidebarProps) {
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(
    null
  );
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollTopSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = scrollTopSentinelRef.current;
    if (
      !scrollViewport ||
      !sentinel ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsScrolled(!entry.isIntersecting),
      { root: scrollViewport }
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [scrollViewport]);

  return (
    <div className="flex h-full w-[320px] flex-col border-r border-border bg-app-background">
      <div className="z-50 flex justify-end gap-2 p-sidebar-side-spacing pb-0">
        <div className="flex-1">
          <SearchInput
            name="search"
            placeholder="Search"
            value=""
            onChange={() => {}}
          />
        </div>
        <Button
          label="New"
          icon={MessagePlusCircle}
          variant="highlight"
          className="shrink-0"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea
          viewportRef={setScrollViewport}
          className="dd-privacy-mask h-full w-full"
        >
          <div ref={scrollTopSentinelRef} className="h-px" aria-hidden />
          <div className="sticky top-0 z-30 h-0" aria-hidden>
            <div
              style={{
                height: `${heightPx}px`,
                backdropFilter: `blur(${blurPx}px)`,
                WebkitBackdropFilter: `blur(${blurPx}px)`,
                maskImage: `linear-gradient(to bottom, black 0%, transparent ${maskEndPct}%)`,
                WebkitMaskImage: `linear-gradient(to bottom, black 0%, transparent ${maskEndPct}%)`,
                backgroundColor:
                  tintPct > 0
                    ? `color-mix(in oklab, var(--color-app-background) ${tintPct}%, transparent)`
                    : undefined,
              }}
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0",
                "transition-opacity duration-200",
                isScrolled ? "opacity-100" : "opacity-0"
              )}
            />
          </div>

          <div className="flex flex-col gap-4 pt-sidebar-side-spacing">
            <NavigationList className="mx-sidebar-side-spacing pt-1">
              <NavigationListItem
                label="For you"
                icon={Lightbulb04}
                suffix={<Counter value={1} size="xs" variant="highlight" />}
              />
              <NavigationListItem icon={Robot} label="Agents" />
              <NavigationListItem icon={Robot} label="Skills" />
            </NavigationList>

            <NavigationList className="mx-sidebar-side-spacing">
              {CONVERSATIONS.map((title) => (
                <NavigationListItem key={title} label={title} />
              ))}
            </NavigationList>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: SliderRowProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="copy-sm text-muted-foreground">
        {label}: {value}
        {unit}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function SidebarScrollBlur() {
  const [blurPx, setBlurPx] = useState(2);
  const [heightPx, setHeightPx] = useState(32);
  const [maskEndPct, setMaskEndPct] = useState(100);
  const [tintPct, setTintPct] = useState(0);

  const className = [
    "pointer-events-none absolute inset-x-0 top-0",
    `h-[${heightPx}px]`,
    `backdrop-blur-[${blurPx}px]`,
    tintPct > 0 ? `bg-app-background/${tintPct}` : null,
    `[mask-image:linear-gradient(to_bottom,black_0%,transparent_${maskEndPct}%)]`,
    "transition-opacity duration-200",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        blurPx={blurPx}
        heightPx={heightPx}
        maskEndPct={maskEndPct}
        tintPct={tintPct}
      />

      <div className="flex w-[380px] flex-col gap-4 p-6">
        <h2 className="heading-lg text-foreground">Top-scroll blur</h2>
        <p className="copy-sm text-muted-foreground">
          Scroll the sidebar to reveal the overlay.
        </p>

        <SliderRow
          label="Blur"
          value={blurPx}
          min={0}
          max={12}
          unit="px"
          onChange={setBlurPx}
        />
        <SliderRow
          label="Height"
          value={heightPx}
          min={8}
          max={96}
          step={4}
          unit="px"
          onChange={setHeightPx}
        />
        <SliderRow
          label="Mask fade ends at"
          value={maskEndPct}
          min={10}
          max={100}
          step={5}
          unit="%"
          onChange={setMaskEndPct}
        />
        <SliderRow
          label="Background tint"
          value={tintPct}
          min={0}
          max={100}
          step={5}
          unit="%"
          onChange={setTintPct}
        />

        <div className="mt-4 rounded-xl border border-border bg-muted-background p-3">
          <p className="copy-xs mb-2 text-muted-foreground">className</p>
          <code className="copy-xs block break-all text-foreground">
            {className}
          </code>
        </div>
      </div>
    </div>
  );
}
