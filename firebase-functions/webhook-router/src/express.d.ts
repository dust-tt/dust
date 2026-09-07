import type { Cell } from "./webhook-router-config.js";

declare global {
  namespace Express {
    interface Request {
      cells?: Cell[];
    }
  }
}

export {};
