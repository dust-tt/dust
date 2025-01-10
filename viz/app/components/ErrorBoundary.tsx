import React from "react";

interface ErrorBoundaryState {
  error: unknown;
  hasError: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onErrored: (e?: unknown) => void;
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
    this.props.onErrored(error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return <>{this.props.children}</>;
  }
}
