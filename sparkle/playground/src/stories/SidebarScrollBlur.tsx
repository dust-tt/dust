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
// top-of-scroll blur can be tuned in isolation.
//
// "Single" is one backdrop-filter layer faded out by a mask — cheap, but the
// blur radius is constant so the eye catches where it stops.
// "Progressive" stacks N layers, each blurring more and masked to a shorter
// band, so the radius itself ramps up towards the header. That's the effect
// used by macOS/iOS (and what the Claude Code sidebar looks like).

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

type Mode = "shadow" | "single" | "progressive";

const SHADOWS = ["shadow", "shadow-md", "shadow-lg", "shadow-xl"] as const;

interface OverlayConfig {
  mode: Mode;
  heightPx: number;
  blurPx: number;
  layers: number;
  tintPct: number;
  paddingPx: number;
  shadow: string;
}

/**
 * Layers for the progressive mode. Each one blurs twice as much as the
 * previous and is masked to a band half as tall, so blur ramps up towards the
 * top with no single visible edge.
 */
function progressiveLayers(count: number, blurPx: number) {
  return Array.from({ length: count }, (_, i) => {
    const stop = 100 / 2 ** i;
    return {
      key: i,
      blur: blurPx * 2 ** i,
      maskStop: stop,
    };
  });
}

function ScrollBlurOverlay({
  config,
  isVisible,
}: {
  config: OverlayConfig;
  isVisible: boolean;
}) {
  const { mode, heightPx, blurPx, layers, tintPct } = config;

  const tint =
    tintPct > 0
      ? `color-mix(in oklab, var(--color-app-background) ${tintPct}%, transparent)`
      : undefined;

  const common = cn(
    "pointer-events-none absolute inset-x-0 top-0",
    "transition-opacity duration-200",
    isVisible ? "opacity-100" : "opacity-0"
  );

  if (mode === "single") {
    return (
      <div
        className={common}
        style={{
          height: `${heightPx}px`,
          backdropFilter: `blur(${blurPx}px)`,
          WebkitBackdropFilter: `blur(${blurPx}px)`,
          backgroundColor: tint,
          maskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, transparent 100%)",
        }}
      />
    );
  }

  return (
    <>
      {tint && (
        <div
          className={common}
          style={{
            height: `${heightPx}px`,
            backgroundColor: tint,
            maskImage: "linear-gradient(to bottom, black 0%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, transparent 100%)",
          }}
        />
      )}
      {progressiveLayers(layers, blurPx).map(({ key, blur, maskStop }) => {
        const mask = `linear-gradient(to bottom, black 0%, black ${maskStop / 2}%, transparent ${maskStop}%)`;
        return (
          <div
            key={key}
            className={common}
            style={{
              height: `${heightPx}px`,
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
    </>
  );
}

function Sidebar({ config }: { config: OverlayConfig }) {
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
      <div className="z-50 flex justify-end gap-2 p-sidebar-side-spacing">
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
            {config.mode === "shadow" ? (
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 h-px",
                  "bg-app-background transition-opacity duration-200",
                  config.shadow,
                  isScrolled ? "opacity-100" : "opacity-0"
                )}
              />
            ) : (
              <ScrollBlurOverlay config={config} isVisible={isScrolled} />
            )}
          </div>

          <div
            className="flex flex-col gap-4"
            style={{ paddingTop: `${config.paddingPx}px` }}
          >
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
  const [mode, setMode] = useState<Mode>("shadow");
  const [heightPx, setHeightPx] = useState(40);
  const [blurPx, setBlurPx] = useState(1);
  const [layers, setLayers] = useState(4);
  const [tintPct, setTintPct] = useState(0);
  const [paddingPx, setPaddingPx] = useState(0);
  const [shadow, setShadow] = useState<string>("shadow-md");

  const config = { mode, heightPx, blurPx, layers, tintPct, paddingPx, shadow };

  const snippet =
    mode === "shadow"
      ? `pointer-events-none absolute inset-x-0 top-0 h-px bg-app-background ${shadow} transition-opacity duration-200`
      : mode === "single"
        ? [
            "pointer-events-none absolute inset-x-0 top-0",
            `h-[${heightPx}px] backdrop-blur-[${blurPx}px]`,
            tintPct > 0 ? `bg-app-background/${tintPct}` : null,
            "[mask-image:linear-gradient(to_bottom,black_0%,transparent_100%)]",
            "transition-opacity duration-200",
          ]
            .filter(Boolean)
            .join(" ")
        : progressiveLayers(layers, blurPx)
            .map(
              ({ blur, maskStop }) =>
                `blur ${blur}px · mask black→${maskStop / 2}%→transparent ${maskStop}%`
            )
            .join("\n");

  return (
    <div className="flex h-screen bg-background">
      <Sidebar config={config} />

      <div className="flex w-[420px] flex-col gap-4 p-6">
        <h2 className="heading-lg text-foreground">Top-scroll blur</h2>
        <p className="copy-sm text-muted-foreground">
          Scroll the sidebar to reveal the overlay.
        </p>

        <div className="flex gap-2">
          <Button
            size="sm"
            label="Shadow"
            variant={mode === "shadow" ? "primary" : "outline"}
            onClick={() => setMode("shadow")}
          />
          <Button
            size="sm"
            label="Progressive"
            variant={mode === "progressive" ? "primary" : "outline"}
            onClick={() => setMode("progressive")}
          />
          <Button
            size="sm"
            label="Single layer"
            variant={mode === "single" ? "primary" : "outline"}
            onClick={() => setMode("single")}
          />
        </div>

        {mode === "shadow" && (
          <div className="flex flex-wrap gap-2">
            {SHADOWS.map((s) => (
              <Button
                key={s}
                size="xs"
                label={s}
                variant={shadow === s ? "primary" : "outline"}
                onClick={() => setShadow(s)}
              />
            ))}
          </div>
        )}

        <SliderRow
          label="Padding above content"
          value={paddingPx}
          min={0}
          max={64}
          step={4}
          unit="px"
          onChange={setPaddingPx}
        />
        <SliderRow
          label="Band height"
          value={heightPx}
          min={8}
          max={120}
          step={4}
          unit="px"
          onChange={setHeightPx}
        />
        <SliderRow
          label={mode === "single" ? "Blur" : "Base blur (doubles per layer)"}
          value={blurPx}
          min={0.5}
          max={8}
          step={0.5}
          unit="px"
          onChange={setBlurPx}
        />
        {mode === "progressive" && (
          <SliderRow
            label="Layers"
            value={layers}
            min={1}
            max={6}
            unit=""
            onChange={setLayers}
          />
        )}
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
          <p className="copy-xs mb-2 text-muted-foreground">
            {mode === "single" ? "className" : "layers (top → bottom)"}
          </p>
          <code className="copy-xs block whitespace-pre-wrap break-all text-foreground">
            {snippet}
          </code>
        </div>
      </div>
    </div>
  );
}
