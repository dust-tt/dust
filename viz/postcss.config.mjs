import { fileURLToPath } from "node:url";

/** @type {import("postcss-load-config").Config} */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    [fileURLToPath(
      new URL("./postcss/tailwind-v3-compat.cjs", import.meta.url)
    )]: {},
  },
};
