import type { Env } from "hono";
import { Hono } from "hono";

// `strict: false` makes Hono treat `/foo` and `/foo/` as the same route,
// matching Next.js routing behavior (front). Hono is strict by default, which
// would cause requests with trailing slashes to fall through to catch-all
// 404s.
const HONO_OPTIONS = {
  strict: false,
} as const;

export function createHono<E extends Env = Env>(): Hono<E> {
  return new Hono<E>(HONO_OPTIONS);
}
