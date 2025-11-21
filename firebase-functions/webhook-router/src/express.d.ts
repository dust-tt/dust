import type { Region } from "./webookConfig";

declare global {
  namespace Express {
    interface Request {
      regions?: Region[];
    }
  }
}

export {};
