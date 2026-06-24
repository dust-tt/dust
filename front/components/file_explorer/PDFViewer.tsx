import { clientFetch } from "@app/lib/egress/client";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Button, Spinner } from "@dust-tt/sparkle";
import { useEffect, useReducer, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const ZOOM_LEVELS = [0.5, 0.66, 0.75, 1.0, 1.25, 1.5, 2.0];
const DEFAULT_ZOOM_IDX = 3;
const BASE_PAGE_WIDTH = 680;

type State = {
  isFetching: boolean;
  hasError: boolean;
  objectUrl: string | null;
  numPages: number | null;
  currentPage: number;
  zoomIdx: number;
};

type Action =
  | { type: "fetch_success"; objectUrl: string }
  | { type: "fetch_error" }
  | { type: "document_loaded"; numPages: number }
  | { type: "document_error" }
  | { type: "set_current_page"; page: number }
  | { type: "zoom_in" }
  | { type: "zoom_out" };

function makeInitialState(zoomIdx: number): State {
  return {
    currentPage: 1,
    hasError: false,
    isFetching: true,
    numPages: null,
    objectUrl: null,
    zoomIdx,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "fetch_success":
      return { ...state, isFetching: false, objectUrl: action.objectUrl };

    case "fetch_error":
      return { ...state, isFetching: false, hasError: true };

    case "document_loaded":
      return { ...state, numPages: action.numPages };

    case "document_error":
      return { ...state, hasError: true };

    case "set_current_page":
      return { ...state, currentPage: action.page };

    case "zoom_in":
      return {
        ...state,
        zoomIdx: Math.min(state.zoomIdx + 1, ZOOM_LEVELS.length - 1),
      };

    case "zoom_out":
      return { ...state, zoomIdx: Math.max(state.zoomIdx - 1, 0) };

    default:
      assertNeverAndIgnore(action);
      return state;
  }
}

interface PDFViewerProps {
  url: string;
  // Initial zoom level index into ZOOM_LEVELS. Defaults to DEFAULT_ZOOM_IDX
  // (100%). Callers with a narrower container (e.g. the side panel previewing
  // wide slides) can pass a smaller index so pages don't render oversized.
  initialZoomIdx?: number;
}

export function PDFViewer({
  url,
  initialZoomIdx = DEFAULT_ZOOM_IDX,
}: PDFViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useReducer(
    reducer,
    initialZoomIdx,
    makeInitialState
  );
  const { isFetching, hasError, objectUrl, numPages, currentPage, zoomIdx } =
    state;

  useEffect(() => {
    let cancelled = false;
    let createdObjectUrl: string | null = null;

    void (async () => {
      try {
        const res = await clientFetch(url);
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          dispatch({ type: "fetch_error" });
          return;
        }

        const blob = await res.blob();
        if (cancelled) {
          return;
        }

        createdObjectUrl = URL.createObjectURL(blob);
        dispatch({ type: "fetch_success", objectUrl: createdObjectUrl });
      } catch {
        if (!cancelled) {
          dispatch({ type: "fetch_error" });
        }
      }
    })();

    return () => {
      cancelled = true;

      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [url]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !numPages) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const topVisible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          .at(0);

        if (topVisible && topVisible.target instanceof HTMLElement) {
          const pageNum = Number(topVisible.target.dataset.pageNumber);
          if (!isNaN(pageNum)) {
            dispatch({ type: "set_current_page", page: pageNum });
          }
        }
      },
      { root: container, threshold: 0.1 }
    );

    container
      .querySelectorAll("[data-page-number]")
      .forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [numPages]);

  const zoom = ZOOM_LEVELS[zoomIdx] ?? 1.0;
  const pageWidth = Math.round(BASE_PAGE_WIDTH * zoom);

  const isLoading = isFetching || (!hasError && numPages === null);

  return (
    <div className="flex h-full flex-col gap-2">
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      )}
      {hasError && (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-sm text-muted-foreground">
            Unable to load file. You can download it instead.
          </p>
        </div>
      )}
      {!isFetching && !hasError && (
        <>
          {numPages !== null && (
            <div className="flex items-center justify-between rounded-lg bg-muted-background px-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {numPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  label="-"
                  disabled={zoomIdx <= 0}
                  onClick={() => dispatch({ type: "zoom_out" })}
                  tooltip="Zoom out"
                />
                <span className="w-10 text-center text-xs text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  label="+"
                  disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
                  onClick={() => dispatch({ type: "zoom_in" })}
                  tooltip="Zoom in"
                />
              </div>
            </div>
          )}
          <div
            ref={scrollRef}
            className={
              numPages !== null
                ? "flex-1 min-h-0 overflow-auto rounded-lg"
                : "hidden"
            }
          >
            <Document
              file={objectUrl}
              onLoadSuccess={({ numPages: n }) =>
                dispatch({ type: "document_loaded", numPages: n })
              }
              onLoadError={() => dispatch({ type: "document_error" })}
              loading={null}
              error={null}
            >
              {/* w-fit + min-w-full keeps pages centered when they fit, but
                  anchors their left edge to the scroll origin when a page is
                  wider than the viewport, so the left edge stays reachable. */}
              <div className="flex w-fit min-w-full flex-col items-center gap-4 py-4">
                {Array.from({ length: numPages ?? 0 }, (_, i) => (
                  <div key={i + 1} data-page-number={i + 1}>
                    <Page
                      pageNumber={i + 1}
                      width={pageWidth}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="shadow-md"
                    />
                  </div>
                ))}
              </div>
            </Document>
          </div>
        </>
      )}
    </div>
  );
}
