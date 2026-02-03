import {
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { LLMTrace } from "@app/lib/api/llm/traces/types";

interface RawJsonTabProps {
  trace: LLMTrace;
}

export function RawJsonTab({ trace }: RawJsonTabProps) {
  const { isDark } = useTheme();
  const [isCopied, copy] = useCopyToClipboard();

  return (
    <div>
      <div className="mb-4 pt-4 flex justify-end">
        <Button
          label={isCopied ? "Copied!" : "Copy JSON"}
          variant="outline"
          size="sm"
          icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
          onClick={() => copy(JSON.stringify(trace, null, 2))}
        />
      </div>
      <JsonViewer
        theme={isDark ? "dark" : "light"}
        value={trace}
        rootName="trace"
        defaultInspectDepth={3}
        className="p-4"
      />
    </div>
  );
}
