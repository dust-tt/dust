import "@uiw/react-textarea-code-editor/dist.css";

import type { ReactNode } from "react";
import { lazy, Suspense } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";

const CodeEditor = lazy(() =>
  import("@uiw/react-textarea-code-editor").then((mod) => ({
    default: mod.default,
  }))
);

function DefaultCodeEditorFallback() {
  return (
    <div className="mt-5 h-32 animate-pulse rounded-md bg-muted-background" />
  );
}

export interface CustomCodeEditorProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  language?: string;
  placeholder?: string;
  readOnly?: boolean;
  padding?: number;
  minHeight?: number;
  className?: string;
  style?: React.CSSProperties;
  fallback?: ReactNode;
  // Additional props that might be passed to CodeEditor
  [key: string]: unknown;
}

export function CustomCodeEditor({
  value,
  onChange,
  language = "js",
  placeholder = "",
  readOnly = false,
  padding = 15,
  minHeight,
  className = "rounded-lg bg-muted-background dark:bg-muted-background-night",
  style,
  fallback,
  ...otherProps
}: CustomCodeEditorProps) {
  console.log("CustomCodeEditor", value);
  const { isDark } = useTheme();

  const defaultStyle: React.CSSProperties = {
    fontSize: 12,
    fontFamily:
      "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
    ...style,
  };

  return (
    <Suspense fallback={fallback ?? <DefaultCodeEditorFallback />}>
      <CodeEditor
        data-color-mode={isDark ? "dark" : "light"}
        readOnly={readOnly}
        value={value}
        language={language}
        placeholder={placeholder}
        onChange={onChange}
        padding={padding}
        minHeight={minHeight}
        className={className}
        style={defaultStyle}
        {...otherProps}
      />
    </Suspense>
  );
}
