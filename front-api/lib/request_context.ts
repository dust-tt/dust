import {
  type RequestStorage,
  setRequestStorageResolver,
} from "@app/types/shared/utils/request_context";
import { tryGetContext } from "hono/context-storage";

export type RequestStorageEnv = {
  Variables: RequestStorage;
};

export function configureHonoRequestStorage(): void {
  setRequestStorageResolver(() => {
    const context = tryGetContext<RequestStorageEnv>();
    if (!context) {
      return undefined;
    }

    return {
      queryCache: context.get("queryCache"),
      requestContext: context.get("requestContext"),
    };
  });
}
