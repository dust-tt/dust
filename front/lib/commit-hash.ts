// We must use NEXT_PUBLIC_ prefix to make it available on the client side.
export const COMMIT_HASH = process.env.NEXT_PUBLIC_COMMIT_HASH || "development";
