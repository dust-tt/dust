import { Button } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

import {
  PANEL_LAYOUT_SPEC as SPEC,
  PanelLayout,
  PanelLayoutNav,
  PanelLayoutPanel,
  type PanelSizingType,
} from "../components/PanelLayout";

// Interactive demo and living documentation of the PanelLayout system.
// The sidebar lists the rules; Panel 2 opens the demo panels with any sizing
// type; the demo panels describe their own behavior and show their live width.

// ── Live width readout ────────────────────────────────────────────────────────

function LiveWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const measure = () =>
      setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="rounded-lg border border-separator bg-muted-background px-3 py-2 text-center"
    >
      <span className="font-mono text-2xl font-semibold text-foreground">
        {width}px
      </span>
      <p className="text-xs text-muted-foreground">live panel width</p>
    </div>
  );
}

// ── Copy ──────────────────────────────────────────────────────────────────────

// All numbers below come from PANEL_LAYOUT_SPEC so this page cannot drift
// from the engine's actual constants.
const SIZING_EXPLANATIONS: Record<PanelSizingType, string> = {
  default:
    "This panel entered as “default”, so it took focus: it gets all the " +
    `remaining space while every other panel drops to its compact width ` +
    `(${SPEC.panelCompact}px). Focus always belongs to the last-entered default panel.`,
  secondary:
    "This panel is “secondary”: it never takes focus and holds its compact " +
    `width (${SPEC.panelCompact}px). Focus stayed where it was — this is how side panels ` +
    "like citations, files, or credit usage behave.",
  shared:
    "This panel is “shared”: it never takes focus but splits the remaining " +
    "space 50/50 with the focus panel — the co-edition pattern. Drag the " +
    "splitter next to it: the width pins and it stops sharing until a panel " +
    "opens or closes.",
};

function RuleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-col gap-1.5 text-sm text-foreground">
        {children}
      </div>
    </div>
  );
}

function NavRules() {
  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-4">
      <RuleSection title="Sizing types">
        <p>
          <span className="font-medium">Default</span> — takes focus on entry
          and gets the remaining space.
        </p>
        <p>
          <span className="font-medium">Secondary</span> — never takes focus,
          holds compact width ({SPEC.panelCompact}px).
        </p>
        <p>
          <span className="font-medium">Shared</span> — splits the remaining
          space 50/50 with the focus panel.
        </p>
        <p className="text-muted-foreground">
          Every panel floors at its minimal width ({SPEC.panelMinimal}px).
          Replacing an open panel's content re-applies the rules as if it had
          closed and reopened.
        </p>
      </RuleSection>

      <RuleSection title="Columns by window width">
        <p>&lt; {SPEC.mobileBreakpoint} — mobile: one panel at a time.</p>
        <p>
          &lt; {SPEC.navAutoHideBelow} — 2 panels; sidebar yields to the 2nd
          panel.
        </p>
        <p>{SPEC.navAutoHideBelow}+ — sidebar + 2 panels.</p>
        <p>{SPEC.threePanelsFrom}+ — 3 panels, sidebar hidden.</p>
        <p>{SPEC.navWithThreePanelsFrom}+ — sidebar + 3 panels.</p>
        <p className="text-muted-foreground">
          Beyond the cap, the upper-most non-focus panel is evicted — and the
          sidebar never outlives an evicted panel. When hidden, reach it via the
          toggle button or by hovering the left edge.
        </p>
      </RuleSection>

      <RuleSection title="Resizing">
        <p>
          Dragging a splitter pins the non-focus side at that width; the focus
          panel keeps flexing with the window.
        </p>
        <p className="text-muted-foreground">
          Pins reset whenever a panel opens, closes, or focus moves.
        </p>
      </RuleSection>

      <RuleSection title="Fullscreen">
        <p>
          Panels with{" "}
          <span className="font-mono text-xs">fullscreenEnabled</span> show a ⤢
          toggle next to their close button: the panel takes the whole card and
          the sidebar hides.
        </p>
      </RuleSection>
    </div>
  );
}

// ── Demo panel content ────────────────────────────────────────────────────────

function SizingPicker({
  value,
  onChange,
}: {
  value: PanelSizingType | null;
  onChange: (type: PanelSizingType) => void;
}) {
  const types: PanelSizingType[] = ["default", "secondary", "shared"];
  return (
    <div className="flex items-center gap-1.5">
      {types.map((type) => (
        <Button
          key={type}
          size="sm"
          variant={value === type ? "primary" : "outline"}
          label={type}
          onClick={() => onChange(type)}
        />
      ))}
    </div>
  );
}

function DemoPanelContent({
  type,
  onSwapType,
}: {
  type: PanelSizingType;
  onSwapType: (type: PanelSizingType) => void;
}) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      <LiveWidth />
      <p className="text-sm text-foreground">{SIZING_EXPLANATIONS[type]}</p>
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Swap this panel's content
        </p>
        <SizingPicker value={type} onChange={onSwapType} />
        <p className="text-xs text-muted-foreground">
          The panel stays open while its content — and sizing type — is replaced
          in place: swapping to “default” grabs focus, swapping away from it
          hands focus back. Also try the ⤢ fullscreen toggle in the top bar.
        </p>
      </div>
    </div>
  );
}

// ── Story ─────────────────────────────────────────────────────────────────────

export default function Panels() {
  const [p3Type, setP3Type] = useState<PanelSizingType | null>(null);
  const [p4Type, setP4Type] = useState<PanelSizingType | null>(null);

  const p2Content = (
    <div className="flex max-w-lg flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">
          Panel system demo
        </h1>
        <p className="text-sm text-muted-foreground">
          This panel (Panel 2) is always open and is “default”-typed: it holds
          focus until a deeper default panel enters, and gets it back when that
          panel closes or turns secondary/shared. The sidebar lists all the
          rules.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Open Panel 3 as…
        </p>
        <SizingPicker value={p3Type} onChange={setP3Type} />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Open Panel 4 as…
        </p>
        <SizingPicker value={p4Type} onChange={setP4Type} />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Things to try
        </p>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-foreground">
          <li>
            Open Panel 3 as “default” — it takes focus and this panel drops to
            compact.
          </li>
          <li>
            Add Panel 4 as “shared” — it splits the space with the focus panel.
          </li>
          <li>
            Swap an open panel's type from inside it — the rules re-apply in
            place.
          </li>
          <li>
            Drag the splitters — the width pins until a panel opens or closes.
          </li>
          <li>
            Resize the window across {SPEC.navWithThreePanelsFrom} /{" "}
            {SPEC.threePanelsFrom} / {SPEC.navAutoHideBelow}px to watch columns
            and the sidebar drop.
          </li>
          <li>
            Hit ⤢ in a demo panel's top bar for fullscreen; below{" "}
            {SPEC.mobileBreakpoint}px, panels stack mobile-style.
          </li>
        </ol>
      </div>
    </div>
  );

  return (
    <PanelLayout>
      <PanelLayoutNav
        topBarLeft={
          <span className="px-2 text-sm font-medium text-foreground">
            Layout rules
          </span>
        }
      >
        <NavRules />
      </PanelLayoutNav>

      <PanelLayoutPanel
        label="Panel system demo"
        isOpen={true}
        onClose={() => {}}
        topBarLeft={
          <span className="text-sm font-medium text-foreground">
            Panel 2 · default (always open)
          </span>
        }
      >
        {p2Content}
      </PanelLayoutPanel>

      <PanelLayoutPanel
        label={`Panel 3 · ${p3Type ?? "closed"}`}
        sizingType={p3Type ?? "default"}
        fullscreenEnabled
        isOpen={p3Type !== null}
        onClose={() => setP3Type(null)}
        topBarLeft={
          <span className="text-sm font-medium text-foreground">
            Panel 3 · {p3Type}
          </span>
        }
      >
        {p3Type && <DemoPanelContent type={p3Type} onSwapType={setP3Type} />}
      </PanelLayoutPanel>

      <PanelLayoutPanel
        label={`Panel 4 · ${p4Type ?? "closed"}`}
        sizingType={p4Type ?? "default"}
        fullscreenEnabled
        isOpen={p4Type !== null}
        onClose={() => setP4Type(null)}
        topBarLeft={
          <span className="text-sm font-medium text-foreground">
            Panel 4 · {p4Type}
          </span>
        }
      >
        {p4Type && <DemoPanelContent type={p4Type} onSwapType={setP4Type} />}
      </PanelLayoutPanel>
    </PanelLayout>
  );
}
