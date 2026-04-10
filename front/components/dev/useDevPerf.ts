import { useEffect, useState } from "react";

export interface PerfMetrics {
  memoryMb: number | null;
  fps: number;
  jankPct: number;
}

const EMPTY: PerfMetrics = {
  memoryMb: null,
  fps: 0,
  jankPct: 0,
};

// Chrome-only: performance.memory
interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function getMemoryMb(): number | null {
  const perf = performance as unknown as { memory?: PerformanceMemory };
  if (perf.memory) {
    return Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
  }
  return null;
}

const JANK_WINDOW_MS = 5_000;

export function useDevPerf(): PerfMetrics {
  const [metrics, setMetrics] = useState<PerfMetrics>(EMPTY);

  useEffect(() => {
    const jankEntries: { time: number; durationMs: number }[] = [];

    // FPS counter via requestAnimationFrame.
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let currentFps = 0;
    let rafId = 0;

    function countFrame() {
      frameCount++;
      const now = performance.now();
      const elapsedMs = now - lastFpsTime;
      if (elapsedMs >= 1000) {
        currentFps = Math.round((frameCount * 1000) / elapsedMs);
        frameCount = 0;
        lastFpsTime = now;
      }
      rafId = requestAnimationFrame(countFrame);
    }
    rafId = requestAnimationFrame(countFrame);

    // Long task observer (jank detection, rolling 5s window).
    let longTaskObserver: PerformanceObserver | null = null;
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        const now = performance.now();
        for (const entry of list.getEntries()) {
          jankEntries.push({ time: now, durationMs: entry.duration });
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: false });
    } catch {
      // Not supported.
    }

    // Poll metrics every second.
    const interval = setInterval(() => {
      const now = performance.now();
      const cutoff = now - JANK_WINDOW_MS;
      while (jankEntries.length > 0 && jankEntries[0].time < cutoff) {
        jankEntries.shift();
      }

      let totalBlockedMs = 0;
      for (const entry of jankEntries) {
        totalBlockedMs += entry.durationMs;
      }

      setMetrics({
        memoryMb: getMemoryMb(),
        fps: currentFps,
        jankPct: Math.round((totalBlockedMs / JANK_WINDOW_MS) * 100),
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(rafId);
      longTaskObserver?.disconnect();
    };
  }, []);

  return metrics;
}
