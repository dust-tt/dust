import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Label,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";

interface PokeJsonBlockProps {
  defaultOpen?: boolean;
  emptyMessage?: string;
  label: string;
  value: unknown;
}

export function PokeJsonBlock({
  defaultOpen = false,
  emptyMessage = "Not recorded.",
  label,
  value,
}: PokeJsonBlockProps) {
  const { isDark } = useTheme();

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger>
        <Label className="cursor-pointer">{label}</Label>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {value === undefined || value === null ? (
          <p className="py-1 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <JsonViewer
            className="max-h-96 overflow-auto py-2"
            defaultInspectDepth={2}
            rootName={false}
            theme={isDark ? "dark" : "light"}
            value={value}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
