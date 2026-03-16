import type { ReactNode } from "react";
import * as React from "react";
import { Suspense } from "react";

import { ChunkLoadError } from "./safeLazy";

interface SafeSuspenseProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ChunkLoadErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ChunkLoadErrorBoundaryState {
  hasChunkError: boolean;
}

/**
 * Error boundary that only catches ChunkLoadError (thrown by safeLazy).
 * All other errors are re-thrown to be handled by a parent error boundary.
 */
class ChunkLoadErrorBoundary extends React.Component<
  ChunkLoadErrorBoundaryProps,
  ChunkLoadErrorBoundaryState
> {
  constructor(props: ChunkLoadErrorBoundaryProps) {
    super(props);
    this.state = { hasChunkError: false };
  }

  static getDerivedStateFromError(
    error: Error
  ): ChunkLoadErrorBoundaryState | null {
    if (error instanceof ChunkLoadError) {
      return { hasChunkError: true };
    }
    return null;
  }

  componentDidCatch(error: Error) {
    if (!(error instanceof ChunkLoadError)) {
      throw error;
    }
  }

  render() {
    if (this.state.hasChunkError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

/**
 * Combines Suspense + ErrorBoundary for lazy-loaded components.
 *
 * On loading: renders the fallback.
 * On ChunkLoadError (e.g. chunk load failure while navigation is locked):
 *   renders the same fallback with a "failed to load" message overlay.
 * Other errors are not caught and propagate to parent error boundaries.
 */
export function SafeSuspense({ children, fallback }: SafeSuspenseProps) {
  return (
    <ChunkLoadErrorBoundary
      fallback={
        <div className="s-relative">
          {fallback}
          <div className="s-absolute s-inset-0 s-flex s-items-center s-justify-center">
            <p className="s-text-sm s-text-muted-foreground">
              Failed to load. Please reload the page.
            </p>
          </div>
        </div>
      }
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </ChunkLoadErrorBoundary>
  );
}
