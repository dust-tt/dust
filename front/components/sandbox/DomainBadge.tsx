import type { ReactNode } from "react";

// The domain "chip": a monospace domain in a muted rounded box, with optional
// trailing badges (scope or status). Shared by the egress list editor and the
// multi-Pod network section so the row chrome stays identical.
export function DomainBadge({
  domain,
  children,
}: {
  domain: string;
  children?: ReactNode;
}) {
  return (
    <div
      title={domain}
      className="flex min-w-0 grow items-center gap-2 overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2"
    >
      <span className="font-mono text-sm text-foreground">{domain}</span>
      {children}
    </div>
  );
}
