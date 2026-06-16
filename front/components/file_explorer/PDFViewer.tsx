import { clientFetch } from "@app/lib/egress/client";
import { Button, Spinner } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const DEFAULT_ZOOM_IDX = 2;
const BASE_PAGE_WIDTH = 680;

interface PDFViewerProps {
  url: string;
}

export function PDFViewer({ url }: PDFViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdObjectUrl: string | null = null;

    setIsFetching(true);
    setObjectUrl(null);
    setHasError(false);
    setNumPages(null);
    setCurrentPage(1);
    setZoomIdx(DEFAULT_ZOOM_IDX);

    void (async () => {
      try {
        const res = await clientFetch(url);
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          setHasError(true);
          return;
        }

        const blob = await res.blob();
        if (cancelled) {
          return;
        }

        createdObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(createdObjectUrl);
      } catch {
        if (!cancelled) {
          setHasError(true);
        }
      } finally {
        if (!cancelled) {
          setIsFetching(false);
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
            setCurrentPage(pageNum);
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
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Unable to load file. You can download it instead.
          </p>
        </div>
      )}
      {!isFetching && !hasError && (
        <>
          {numPages !== null && (
            <div className="flex items-center justify-between rounded-lg bg-muted-background px-3 py-1.5 dark:bg-muted-background-night">
              <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                Page {currentPage} of {numPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  label="-"
                  disabled={zoomIdx <= 0}
                  onClick={() => setZoomIdx((i) => i - 1)}
                  tooltip="Zoom out"
                />
                <span className="w-10 text-center text-xs text-muted-foreground dark:text-muted-foreground-night">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  label="+"
                  disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
                  onClick={() => setZoomIdx((i) => i + 1)}
                  tooltip="Zoom in"
                />
              </div>
            </div>
          )}
          <div
            ref={scrollRef}
            className={
              numPages !== null
                ? "flex-1 min-h-0 overflow-y-auto rounded-lg"
                : "hidden"
            }
          >
            <Document
              file={objectUrl}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              onLoadError={() => setHasError(true)}
              loading={null}
              error={null}
            >
              <div className="flex flex-col items-center gap-4 py-4">
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
