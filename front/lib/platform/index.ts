/**
 * Platform abstraction layer
 *
 * Aliased by consumers (front-spa via Vite) to a concrete implementation.
 * The runtime stubs below throw if invoked unaliased — that path should
 * not exist now that front/ no longer runs as a Next.js app.
 */
import type { SparkleLinkProps } from "@dust-tt/sparkle";
import type { ComponentType, ReactNode } from "react";

import type { AppRouter } from "./types";

const NOT_ALIASED =
  "@app/lib/platform must be aliased to a concrete implementation by the consumer";

function unreachable(): never {
  throw new Error(NOT_ALIASED);
}

export const LinkWrapper: ComponentType<
  SparkleLinkProps & { children: ReactNode }
> = () => unreachable();

export function useAppRouter(): AppRouter {
  return unreachable();
}

export function usePathParams(): Record<string, string | undefined> {
  return unreachable();
}

export function usePathParam(_name: string): string | null {
  return unreachable();
}

export function useRequiredPathParam(_name: string): string {
  return unreachable();
}

export function useSearchParam(_name: string): string | null {
  return unreachable();
}

export function useNavigationBlocker(
  _shouldBlock: boolean,
  _onBlock: () => Promise<boolean>
): void {
  unreachable();
}

export type { AppRouter };
