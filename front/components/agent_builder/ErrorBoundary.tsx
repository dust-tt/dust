import type { ErrorInfo, ReactNode } from "react";
import React, { Component } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class EditorErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details to help debug Safari issues
    console.error("Editor Error Boundary caught error:", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      userAgent: navigator.userAgent,
      isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
    });

    // Store in localStorage for inspection
    try {
      localStorage.setItem(
        "lastEditorError",
        JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (e) {
      // Ignore localStorage errors
    }

    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-warning-500 bg-warning-50 p-4 dark:border-warning-500-night dark:bg-warning-900">
          <h2 className="mb-2 text-lg font-semibold text-warning-900 dark:text-warning-100">
            Editor Error
          </h2>
          <p className="mb-2 text-sm text-warning-800 dark:text-warning-200">
            An error occurred in the editor. Please refresh the page.
          </p>
          {this.state.error && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-medium">
                Error Details
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-warning-100 p-2 dark:bg-warning-800">
                {this.state.error.message}
                {"\n\n"}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
