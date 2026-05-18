import type { ElementType, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

const HOME_REVEAL_CSS = `
  .home-reveal {
    opacity: 0;
    transition-property: opacity, transform, letter-spacing;
    transition-duration: 500ms;
    transition-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  .home-reveal-up { transform: translate3d(0, 14px, 0); }
  .home-reveal-right { transform: translate3d(-6px, 0, 0); }
  .home-reveal-photo { opacity: 0; transform: scale(1.04); transition-duration: 700ms; }
  .home-reveal-running { opacity: 0.35; letter-spacing: 0.06em; transition-duration: 700ms; transition-timing-function: cubic-bezier(0.165, 0.84, 0.44, 1); }
  .home-reveal-in.home-reveal-up,
  .home-reveal-in.home-reveal-right,
  .home-reveal-in.home-reveal-photo { opacity: 1; transform: none; }
  .home-reveal-in.home-reveal-running { opacity: 1; letter-spacing: normal; }
  @media (prefers-reduced-motion: reduce) {
    .home-reveal,
    .home-reveal-up,
    .home-reveal-right,
    .home-reveal-photo,
    .home-reveal-running {
      opacity: 1;
      transform: none;
      letter-spacing: normal;
      transition: none;
    }
  }
`;

/**
 * Injects the keyframes/transition rules used by `HomeReveal`. Render once at
 * the top of any page that uses `<HomeReveal>`. Browsers de-dupe identical
 * style tags, so it's safe to mount in multiple sections of the same page.
 */
export function HomeRevealStyles() {
  return <style dangerouslySetInnerHTML={{ __html: HOME_REVEAL_CSS }} />;
}

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
