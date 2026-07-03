import { useCopyToClipboard } from "@sparkle/hooks/useCopyToClipboard";
import { Check, Clipboard } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React from "react";

/**
 * Shared building blocks for the `Foundations/*` token stories.
 *
 * Guiding principle: a token story must never hard-code a token's *value*. It
 * reads the value live from the compiled CSS custom properties, so every
 * specimen matches exactly what components render — in both light and dark
 * themes — and can never drift from `tokens.css`. The only thing a story
 * curates is *which* tokens to show and in what order.
 */

// The theme addon toggles the `dark` class on <html>. We bump a counter on any
// class mutation so value-reading hooks re-run when the theme flips.
export function useThemeVersion(): number {
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const observer = new MutationObserver(() => setVersion((v) => v + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return version;
}

export function readCssVar(name: string): string {
  if (typeof document === "undefined") {
    return "";
  }
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

// Live value of a CSS custom property, re-read whenever the theme changes.
export function useCssVar(name: string): string {
  const version = useThemeVersion();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is an intentional re-read trigger when the theme toggles; readCssVar reads the DOM so biome can't infer the dependency.
  return React.useMemo(() => readCssVar(name), [name, version]);
}

// Live computed style value(s) of a mounted element, re-read on theme changes.
// `properties` should be a module-scoped constant so its identity is stable.
export function useComputedStyle(
  ref: React.RefObject<HTMLElement | null>,
  properties: readonly string[]
): Record<string, string> {
  const version = useThemeVersion();
  const [values, setValues] = React.useState<Record<string, string>>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is an intentional re-measure trigger when the theme toggles; getComputedStyle reads the DOM so biome can't infer the dependency.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const computed = getComputedStyle(el);
    const next: Record<string, string> = {};
    for (const prop of properties) {
      next[prop] = computed.getPropertyValue(prop).trim();
    }
    setValues(next);
  }, [ref, properties, version]);
  return values;
}

export type ColorFamily = { family: string; shades: string[] };

const NUMERIC_SHADE = /^\d+$/;

// Walk a rule list, recursing into grouping rules (@layer / @media / @supports),
// collecting `--color-<family>-<shade>` custom property names — but only the
// ones declared by theme.css. Its `@theme inline` block emits self-referential
// declarations (`--color-x: var(--color-x)`), which is how we tell the
// design-system palette apart from Tailwind's built-in defaults (e.g. cyan,
// indigo) that emit a literal color value.
const collectColorVars = (rules: CSSRuleList, into: Set<string>): void => {
  for (const rule of Array.from(rules)) {
    const nested = (rule as CSSGroupingRule).cssRules;
    if (nested) {
      collectColorVars(nested, into);
    }
    const style = (rule as CSSStyleRule).style;
    if (!style) {
      continue;
    }
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      if (
        prop.startsWith("--color-") &&
        style.getPropertyValue(prop).trim().startsWith("var(--color")
      ) {
        into.add(prop);
      }
    }
  }
};

/**
 * Discovers every color family that theme.css declares (the design-system
 * source of truth), read from the compiled stylesheets. This means the palette
 * stories can never silently omit a family (e.g. `stone`) and never show
 * Tailwind's built-in defaults that aren't part of the system. Returns families
 * sorted alphabetically, each with its own sorted shade list.
 */
export function useThemeColorTokens(): string[] {
  const [tokens, setTokens] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const props = new Set<string>();
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        collectColorVars(sheet.cssRules, props);
      } catch {
        // Cross-origin stylesheet — its rules can't be read; skip it.
      }
    }
    setTokens(
      Array.from(props)
        .map((prop) => prop.slice("--color-".length))
        .sort()
    );
  }, []);
  return tokens;
}

const shadeOf = (token: string): string | null => {
  const dash = token.lastIndexOf("-");
  if (dash <= 0) {
    return null;
  }
  const shade = token.slice(dash + 1);
  return NUMERIC_SHADE.test(shade) ? shade : null;
};

const familyOf = (token: string): string => token.split("-")[0];

// Group tokens with a numeric shade ramp into families (excluding named ones).
export function groupNumericFamilies(
  tokens: string[],
  exclude: readonly string[] = []
): ColorFamily[] {
  const excludeSet = new Set(exclude);
  const byFamily = new Map<string, Set<string>>();
  for (const token of tokens) {
    const shade = shadeOf(token);
    if (shade === null) {
      continue;
    }
    const family = token.slice(0, token.lastIndexOf("-"));
    if (excludeSet.has(family)) {
      continue;
    }
    if (!byFamily.has(family)) {
      byFamily.set(family, new Set());
    }
    byFamily.get(family)?.add(shade);
  }
  return Array.from(byFamily.entries())
    .map(([family, shades]) => ({
      family,
      shades: Array.from(shades).sort((a, b) => Number(a) - Number(b)),
    }))
    .sort((a, b) => a.family.localeCompare(b.family));
}

export function useColorFamilies(
  exclude: readonly string[] = []
): ColorFamily[] {
  const tokens = useThemeColorTokens();
  const excludeKey = exclude.join(",");
  return React.useMemo(
    () => groupNumericFamilies(tokens, excludeKey ? excludeKey.split(",") : []),
    [tokens, excludeKey]
  );
}

const SEMANTIC_MODIFIER_ORDER = ["light", "dark", "muted", "on"];

// All tokens for one semantic family, ordered base → modifiers → shade ramp.
export function semanticFamilyTokens(
  tokens: string[],
  family: string
): string[] {
  const base = tokens.includes(family) ? [family] : [];
  const modifiers = SEMANTIC_MODIFIER_ORDER.map((m) => `${family}-${m}`).filter(
    (t) => tokens.includes(t)
  );
  const ramp = tokens
    .filter((t) => t.slice(0, t.lastIndexOf("-")) === family && shadeOf(t))
    .sort((a, b) => Number(shadeOf(a)) - Number(shadeOf(b)));
  return [...base, ...modifiers, ...ramp];
}

// Named structural tokens: not part of any numeric ramp, not brand, and not
// belonging to a color family (those are covered by the family tables).
export function structuralTokens(tokens: string[]): string[] {
  const families = new Set(groupNumericFamilies(tokens).map((f) => f.family));
  return tokens
    .filter(
      (t) =>
        shadeOf(t) === null &&
        familyOf(t) !== "brand" &&
        !families.has(familyOf(t))
    )
    .sort();
}

type Rgb = { r: number; g: number; b: number };

let sharedCanvasContext: CanvasRenderingContext2D | null | undefined;

// Parse any CSS color string (hex, rgb, oklch, …) into sRGB bytes by letting the
// browser convert it on a 1×1 canvas. Returns null when unavailable (SSR / no
// 2d context). This is what lets us compute contrast for oklch tokens.
export function cssColorToRgb(color: string): Rgb | null {
  if (typeof document === "undefined" || !color) {
    return null;
  }
  if (sharedCanvasContext === undefined) {
    sharedCanvasContext = document.createElement("canvas").getContext("2d");
  }
  if (!sharedCanvasContext) {
    return null;
  }
  sharedCanvasContext.clearRect(0, 0, 1, 1);
  sharedCanvasContext.fillStyle = "#000";
  sharedCanvasContext.fillStyle = color;
  sharedCanvasContext.fillRect(0, 0, 1, 1);
  const [r, g, b] = sharedCanvasContext.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

export type WcagGrade = "AAA" | "AA" | "AA Large" | "Fail";

// For a given background, which of black/white text reads best against it, and
// how that best pairing scores on WCAG.
export function readableTextOn(cssColor: string): {
  color: "black" | "white";
  ratio: number;
  grade: WcagGrade;
} | null {
  const bg = cssColorToRgb(cssColor);
  if (!bg) {
    return null;
  }
  const onWhite = contrastRatio(bg, WHITE);
  const onBlack = contrastRatio(bg, BLACK);
  const useWhite = onWhite >= onBlack;
  const ratio = useWhite ? onWhite : onBlack;
  const grade: WcagGrade =
    ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA Large" : "Fail";
  return { color: useWhite ? "white" : "black", ratio, grade };
}

/**
 * Wraps any specimen so activating it copies `value` (a class name or token) to
 * the clipboard, with transient "Copied" feedback. Implemented as a
 * `role="button"` container — not a real <button> — so it can safely wrap block
 * content (paragraphs, swatches) without invalid HTML nesting.
 */
export function Copyable({
  value,
  children,
  className,
  hint,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}): React.ReactElement {
  const [isCopied, copy] = useCopyToClipboard();
  const onActivate = () => void copy(value);
  return (
    <div
      role="button"
      tabIndex={0}
      title={hint ?? `Copy "${value}"`}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "group relative cursor-pointer rounded-lg text-left",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {children}
      <span
        className={cn(
          "pointer-events-none absolute right-1 top-1 z-10 rounded px-1.5 py-0.5",
          "bg-foreground font-mono text-[10px] text-background transition-opacity",
          isCopied ? "opacity-100" : "opacity-0 group-hover:opacity-70"
        )}
      >
        {isCopied ? "Copied!" : "Copy"}
      </span>
    </div>
  );
}

// A monospace pill showing a token/class name with a copy icon — the primary
// affordance in the token tables. Click copies `value`; the icon flips to a
// check on success. Theme-aware (primary tints flip in dark mode).
export function TokenChip({
  value,
  label,
}: {
  value: string;
  label?: string;
}): React.ReactElement {
  const [isCopied, copy] = useCopyToClipboard();
  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      title={`Copy "${value}"`}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-md px-2 py-1",
        "bg-primary-100 font-mono text-xs text-primary-800",
        "transition-colors hover:bg-primary-150",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <span className="whitespace-nowrap">{label ?? value}</span>
      {isCopied ? (
        <Check className="h-3 w-3 shrink-0 text-success-500" />
      ) : (
        <Clipboard className="h-3 w-3 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

export type TokenRow = {
  // CSS variable to resolve for the swatch + value column.
  varName: string;
  // Human/display name shown in the chip.
  name: string;
  // What clicking the chip copies (usually the utility class, e.g. `bg-*`).
  copyValue: string;
  // Optional description; the Description column only renders when at least one
  // row provides one.
  description?: React.ReactNode;
};

const TokenTableRow = ({
  row,
  withDescription,
}: {
  row: TokenRow;
  withDescription: boolean;
}) => {
  const value = useCssVar(row.varName);
  const readable = value ? readableTextOn(value) : null;

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-2 pr-4 align-middle">
        <div
          className="h-9 w-16 rounded-md border border-border"
          // Resolve the color in-cascade via var() so it always reflects the
          // active theme, regardless of where the theme class is applied.
          style={{ backgroundColor: `var(${row.varName})` }}
          title={
            readable
              ? `Best text contrast: ${readable.grade} (${readable.ratio.toFixed(2)}:1 on ${readable.color})`
              : undefined
          }
        />
      </td>
      <td className="py-2 pr-4 align-middle">
        <TokenChip value={row.copyValue} label={row.name} />
      </td>
      <td className="py-2 pr-4 align-middle font-mono text-xs text-muted-foreground">
        {value || "—"}
      </td>
      {withDescription && (
        <td className="py-2 align-middle text-sm text-muted-foreground">
          {row.description ?? "—"}
        </td>
      )}
    </tr>
  );
};

// Renders tokens as a reference table: swatch · copyable name chip · live value
// · optional description. The Description column appears only when some row has
// one, so ramps stay compact while semantic/structural tables read like docs.
export function TokenTable({ rows }: { rows: TokenRow[] }): React.ReactElement {
  const withDescription = rows.some((row) => row.description != null);

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
          <th className="w-20 py-2 pr-4 font-medium">Swatch</th>
          <th className="py-2 pr-4 font-medium">Name</th>
          <th className="py-2 pr-4 font-medium">Value</th>
          {withDescription && <th className="py-2 font-medium">Description</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <TokenTableRow
            key={`${row.varName}-${row.name}`}
            row={row}
            withDescription={withDescription}
          />
        ))}
      </tbody>
    </table>
  );
}

// Establishes a themed surface so *every* descendant — including headings and
// specimens with no explicit color — sits on the right background with readable
// text in both light and dark. The Storybook theme addon only toggles the
// `dark` class + a raw page background; it does not set a themed text color,
// so uncolored text would otherwise stay black on a dark background.
export function ThemedSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn("bg-background p-4 text-foreground", className)}>
      {children}
    </div>
  );
}

// Drop into a story's `decorators` to wrap it in a ThemedSurface.
export const withThemedSurface = (Story: () => React.ReactElement) => (
  <ThemedSurface>
    <Story />
  </ThemedSurface>
);
