import { Button, ErrorMessage } from "@viz/app/components/Components";
import React, { useState } from "react";

interface ErrorBoundaryState {
  error: unknown;
  hasError: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  errorMessage: string;
  onRetryClick: (errorMessage: string) => void;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError() {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    this.setState({ hasError: true, error });
  }

  render() {
    if (this.state.hasError) {
      let error: Error;
      if (this.state.error instanceof Error) {
        error = this.state.error;
      } else {
        error = new Error("Unknown error.");
      }

      return (
        <RenderError
          error={error}
          onRetryClick={this.props.onRetryClick}
          message={this.props.errorMessage}
        />
      );
    }

    return <>{this.props.children}</>;
  }
}

// This is the component to render when an error occurs.
export function RenderError({
  error,
  message,
  onRetryClick,
}: {
  error: Error;
  message: string;
  onRetryClick: (errorMessage: string) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="flex w-full flex-col items-center justify-center gap-4">
      <ErrorMessage title="Error">
        <>
          {message}
          <div className="mt-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-pink-700 underline focus:outline-none"
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
            {showDetails && (
              <div className="mt-2 p-2 bg-pink-50 rounded">
                <strong>Error message:</strong> {error.message}
              </div>
            )}
          </div>
        </>
      </ErrorMessage>
      <div>
        <Button label="Retry" onClick={() => onRetryClick(error.message)} />
      </div>
    </div>
  );
}
