// We must use NEXT_PUBLIC_ prefix to make it available on the client side.
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
export const COMMIT_HASH = process.env.NEXT_PUBLIC_COMMIT_HASH || "development";

// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
export const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || "development";
