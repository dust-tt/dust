import type { ElementType, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type RevealAs = "div" | "section" | "article" | "li" | "figure" | "span" | "em";

type RevealVariant = "up" | "right" | "photo" | "running";

interface HomeRevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: RevealAs;
  variant?: RevealVariant;
  threshold?: number;
}

export function HomeReveal({
  children,
  delay = 0,
  className = "",
  as = "div",
  variant = "up",
  threshold = 0.15,
}: HomeRevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  const Tag = as as ElementType;
  const variantClass = `home-reveal-${variant}`;
  return (
    <Tag
      ref={ref as never}
      className={`home-reveal ${variantClass} ${visible ? "home-reveal-in" : ""} ${className}`.trim()}
      style={{ transitionDelay: visible ? `${delay}ms` : undefined }}
    >
      {children}
    </Tag>
  );
}
