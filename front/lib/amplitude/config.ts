import { isDevelopment } from "@app/lib/development";

// This is a public API key, which will endup in the user's browser anyway.
export const AMPLITUDE_PUBLIC_API_KEY = isDevelopment()
  ? "6ba33096c77a939358f9c21e12d73592"
  : "940c526d7c7c91a38c267be75c958890";

export const GROUP_TYPE = "workspace";
