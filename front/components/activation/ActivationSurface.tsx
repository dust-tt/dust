import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { ReactNode } from "react";

interface ActivationSurfaceProps {
  highlightedTitle: string;
  description: ReactNode;
  children: ReactNode;
}

export function ActivationSurface({
  highlightedTitle,
  description,
  children,
}: ActivationSurfaceProps) {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const firstName = user?.firstName ?? user?.fullName?.split(" ")[0] ?? "there";

  return (
    <div className="relative min-h-full w-full overflow-x-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklch, var(--color-border) 20%, transparent) 1px, transparent 1px)",
          backgroundSize: "calc(100% / 7) 100%",
        }}
      />
      <img
        alt=""
        aria-hidden
        className="pointer-events-none absolute -top-[307.6px] left-[227.4px] w-[1067.2px] max-w-none"
        src={
          isDark
            ? "/static/activation/for-you-orb-large-dark.svg"
            : "/static/activation/for-you-orb-large.svg"
        }
      />
      <img
        alt=""
        aria-hidden
        className="pointer-events-none absolute -top-[307.6px] -left-[72.6px] w-[859.2px] max-w-none"
        src={
          isDark
            ? "/static/activation/for-you-orb-small-dark.svg"
            : "/static/activation/for-you-orb-small.svg"
        }
      />
      <div className="relative mx-auto w-full max-w-2xl px-4 pb-16 pt-[15vh] sm:px-8 lg:mx-0 lg:ml-[9%] lg:w-[53%] lg:max-w-none lg:px-0">
        <div className="flex flex-col gap-1">
          <h1 className="text-5xl font-medium leading-[52px] tracking-[-0.06em] text-foreground">
            Welcome back, {firstName}.
          </h1>
          <h1 className="text-5xl font-medium leading-[52px] tracking-[-0.06em] text-highlight">
            {highlightedTitle}
          </h1>
        </div>

        <div className="mt-6 h-px w-[82px] bg-highlight-200" />

        <p className="mt-6 text-sm leading-5 tracking-tight text-muted-foreground">
          {description}
        </p>

        {children}
      </div>
    </div>
  );
}
