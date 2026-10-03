import { cn } from "@dust-tt/sparkle";
import { useState } from "react";

// Mirrors front's StatusBanner (front/components/navigation/AppStatusBanner.tsx),
// TopBanners and NavigationSidebar, so padding and spacing can be iterated on
// here before touching the app.

const ORANGE_VARIANT = cn(
  "border-orange-100",
  "bg-orange-50",
  "text-orange-800",
  "dark:border-info-100 dark:bg-info-50 dark:text-info-700"
);

const SKY_VARIANT = cn("border-sky-100", "bg-sky-50");

interface OutageBannerProps {
  paddingY: number;
}

function OutageBanner({ paddingY }: OutageBannerProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 border-b px-4 text-sm",
        ORANGE_VARIANT
      )}
      style={{ paddingTop: `${paddingY}px`, paddingBottom: `${paddingY}px` }}
    >
      <div className="font-semibold">Degraded performance on conversations</div>
      <div className="font-normal">
        We are investigating elevated error rates on agent conversations. Some
        messages may fail to send. Check our{" "}
        <span className="underline">status page</span> for updates.
      </div>
    </div>
  );
}

function TrialBanner() {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b px-4 py-1",
        SKY_VARIANT
      )}
    >
      <div className="flex gap-2 text-sm">
        <p className="font-semibold text-sky-900">
          Heads up, your trial ends in 5 days
        </p>
        <p className="hidden text-sky-800 md:inline-block">
          When your trial wraps up, your connections and team member access will
          be removed.
        </p>
      </div>
      <span className="whitespace-nowrap text-sm text-sky-900">
        Subscribe to Dust
      </span>
    </div>
  );
}

interface SliderProps {
  label: string;
  hint: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}

function Slider({ label, hint, value, max, onChange }: SliderProps) {
  return (
    <label className="flex items-center gap-3 text-sm text-foreground">
      <span className="w-64 shrink-0">
        {label} <span className="text-muted-foreground">({hint})</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
        {value}px
      </span>
    </label>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function TopBannerView() {
  const [bannerPaddingY, setBannerPaddingY] = useState(8);
  const [spaceBelowBanner, setSpaceBelowBanner] = useState(4);
  const [sidebarPaddingTop, setSidebarPaddingTop] = useState(8);
  const [showOutage, setShowOutage] = useState(true);
  const [showTrial, setShowTrial] = useState(false);

  return (
    <div className="flex h-dvh flex-col bg-app-background">
      <div className="flex flex-col gap-2 border-b border-border bg-background px-4 py-3">
        <Slider
          label="Padding vertical de la bannière"
          hint="StatusBanner, py-2"
          value={bannerPaddingY}
          max={32}
          onChange={setBannerPaddingY}
        />
        <Slider
          label="Espace sous la bannière"
          hint="TopBanners, pb-1"
          value={spaceBelowBanner}
          max={32}
          onChange={setSpaceBelowBanner}
        />
        <Slider
          label="Padding haut de la sidebar"
          hint="NavigationSidebar, pt-2"
          value={sidebarPaddingTop}
          max={32}
          onChange={setSidebarPaddingTop}
        />
        <div className="flex gap-6 pt-1">
          <Toggle
            label="Bannière outage"
            checked={showOutage}
            onChange={setShowOutage}
          />
          <Toggle
            label="Bannière trial empilée au-dessus"
            checked={showTrial}
            onChange={setShowTrial}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className="sticky top-0 z-50 flex shrink-0 flex-col bg-app-background empty:hidden"
          style={{ paddingBottom: `${spaceBelowBanner}px` }}
        >
          {showTrial && <TrialBanner />}
          {showOutage && <OutageBanner paddingY={bannerPaddingY} />}
        </div>

        <div className="flex min-h-0 flex-1 flex-row">
          <div
            className="flex w-80 flex-none flex-col gap-3 bg-app-background"
            style={{ paddingTop: `${sidebarPaddingTop}px` }}
          >
            <div className="mx-3 flex h-8 items-center gap-2 rounded-xl bg-muted-background px-2">
              <div className="h-4 w-12 rounded bg-border" />
              <div className="h-4 w-4 rounded bg-border" />
              <div className="h-4 w-4 rounded bg-border" />
            </div>
            <div className="mx-3 flex gap-2">
              <div className="h-9 flex-1 rounded-xl border border-border" />
              <div className="h-9 w-20 rounded-xl bg-highlight-500" />
            </div>
          </div>

          <div className="my-2 mr-2 flex-1 overflow-hidden rounded-xl border border-border bg-panel-background">
            <div className="flex flex-col gap-3 p-4">
              <div className="h-4 w-64 rounded bg-muted-background" />
              <div className="h-4 w-96 rounded bg-muted-background" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
