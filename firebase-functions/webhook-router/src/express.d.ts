import type { Region } from "./webhookRouterConfig.js";

declare global {
  namespace Express {
    interface Request {
      regions?: Region[];
    }
  }
}

export {};
