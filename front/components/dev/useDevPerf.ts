import { useEffect, useState } from "react";

export interface PerfMetrics {
  memoryMb: number | null;
  fps: number;
  jankPct: number;
  netRequests: number;
}

const EMPTY: PerfMetrics = {
  memoryMb: null,
  fps: 0,
  jankPct: 0,
  netRequests: 0,
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
const NET_WINDOW_MS = 5_000;

// Network interceptor state — ref-counted so multiple hook instances share one patch.
let originalFetch: typeof window.fetch | null = null;
let originalXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
let netTimestamps: number[] = [];
let netPatchRefCount = 0;

function patchNetworkInterceptors() {
  netPatchRefCount++;
  if (netPatchRefCount > 1) {
    return;
  }

  originalFetch = window.fetch;
  window.fetch = function (...args: Parameters<typeof fetch>) {
    netTimestamps.push(performance.now());
    return originalFetch!.apply(this, args);
  };

  originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async_?: boolean,
    username?: string | null,
    password?: string | null
  ) {
    netTimestamps.push(performance.now());
    return originalXhrOpen!.call(this, method, url, async_ ?? true, username, password);
  };
}

function unpatchNetworkInterceptors() {
  netPatchRefCount--;
  if (netPatchRefCount > 0) {
    return;
  }
  if (originalFetch) {
    window.fetch = originalFetch;
    originalFetch = null;
  }
  if (originalXhrOpen) {
    XMLHttpRequest.prototype.open = originalXhrOpen;
    originalXhrOpen = null;
  }
  netTimestamps = [];
}

function getNetRequestsInWindow(): number {
  const cutoff = performance.now() - NET_WINDOW_MS;
  let startIdx = 0;
  while (startIdx < netTimestamps.length && netTimestamps[startIdx] < cutoff) {
    startIdx++;
  }
  if (startIdx > 0) {
    netTimestamps = netTimestamps.slice(startIdx);
  }
  return netTimestamps.length;
}

export function useDevPerf(): PerfMetrics {
  const [metrics, setMetrics] = useState<PerfMetrics>(EMPTY);

  useEffect(() => {
    patchNetworkInterceptors();

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
      let startIdx = 0;
      while (startIdx < jankEntries.length && jankEntries[startIdx].time < cutoff) {
        startIdx++;
      }
      if (startIdx > 0) {
        jankEntries.splice(0, startIdx);
      }

      let totalBlockedMs = 0;
      for (const entry of jankEntries) {
        totalBlockedMs += entry.durationMs;
      }

      setMetrics({
        memoryMb: getMemoryMb(),
        fps: currentFps,
        jankPct: Math.round((totalBlockedMs / JANK_WINDOW_MS) * 100),
        netRequests: getNetRequestsInWindow(),
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(rafId);
      longTaskObserver?.disconnect();
      unpatchNetworkInterceptors();
    };
  }, []);

  return metrics;
}
