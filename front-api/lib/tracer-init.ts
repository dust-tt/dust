import { isDevelopment } from "@app/types/shared/env";

if (!isDevelopment()) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dd-trace/init");
}
