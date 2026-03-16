import { isNavigationLocked } from "@app/lib/navigation-lock";
import { SafeSuspense, safeLazy } from "@dust-tt/sparkle";
import type { TextareaCodeEditorProps } from "@uiw/react-textarea-code-editor";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";

function CodeEditorFallback() {
  return (
    <div className="mt-5 h-32 animate-pulse rounded-md bg-muted-background dark:bg-muted-background-night" />
  );
}

const CodeEditor = safeLazy(
  () =>
    import("@uiw/react-textarea-code-editor").then((mod) => ({
      default: mod.default,
    })),
  { canReload: () => !isNavigationLocked() }
);

export function SuspensedCodeEditor(props: TextareaCodeEditorProps) {
  return (
    <SafeSuspense fallback={<CodeEditorFallback />}>
      <CodeEditor {...props} />
    </SafeSuspense>
  );
}
