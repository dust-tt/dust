import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Clipboard,
  ClipboardCheck,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";

interface WorkspaceMetadataTabProps {
  owner: WorkspaceType;
}

export function WorkspaceMetadataTab({ owner }: WorkspaceMetadataTabProps) {
  const { isDark } = useTheme();
  const [isCopied, copy] = useCopyToClipboard();

  const metadata = owner.metadata ?? {};

  return (
    <div>
      <div className="mb-4 pt-4 flex justify-end">
        <Button
          label={isCopied ? "Copied!" : "Copy JSON"}
          variant="outline"
          size="sm"
          icon={isCopied ? ClipboardCheck : Clipboard}
          onClick={() => copy(JSON.stringify(metadata, null, 2))}
        />
      </div>
      <JsonViewer
        theme={isDark ? "dark" : "light"}
        value={metadata}
        rootName="metadata"
        defaultInspectDepth={3}
        className="p-4"
      />
    </div>
  );
}
