import type { Region } from "./webhook-router-config.js";

declare global {
  namespace Express {
    interface Request {
      regions?: Region[];
    }
  }
}

export {};
