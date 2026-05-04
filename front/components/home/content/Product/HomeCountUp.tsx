import { useEffect, useRef, useState } from "react";

interface HomeCountUpProps {
  to: number;
  durationMs?: number;
  format?: (n: number) => string;
  suffix?: string;
  prefix?: string;
  className?: string;
  threshold?: number;
}

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

export function HomeCountUp({
  to,
  durationMs = 1200,
  format = (n) => n.toLocaleString("en-US"),
  suffix = "",
  prefix = "",
  className,
  threshold = 0.5,
}: HomeCountUpProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(to);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || startedRef.current) {
          return;
        }
        startedRef.current = true;
        const startedAt = performance.now();
        let frame = 0;
        const tick = (t: number) => {
          const progress = Math.min((t - startedAt) / durationMs, 1);
          setValue(Math.round(to * easeOutQuart(progress)));
          if (progress < 1) {
            frame = requestAnimationFrame(tick);
          }
        };
        frame = requestAnimationFrame(tick);
        observer.disconnect();
        return () => cancelAnimationFrame(frame);
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [to, durationMs, threshold]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {format(value)}
      {suffix}
    </span>
  );
}
