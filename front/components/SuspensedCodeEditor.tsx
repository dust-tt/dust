import type { TextareaCodeEditorProps } from "@uiw/react-textarea-code-editor";
import React, { lazy, Suspense } from "react";

function CodeEditorFallback() {
  return (
    <div className="mt-5 h-32 animate-pulse rounded-md bg-muted-background dark:bg-muted-background-night" />
  );
}

const CodeEditor = lazy(() =>
  import("@uiw/react-textarea-code-editor").then((mod) => ({
    default: mod.default,
  }))
);

export function SuspensedCodeEditor(props: TextareaCodeEditorProps) {
  return (
    <Suspense fallback={<CodeEditorFallback />}>
      <CodeEditor {...props} />
    </Suspense>
  );
}
