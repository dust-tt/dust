export interface NangoError extends Error {
  code: string;
  status: number;
  config?: {
    url?: string;
  };
}

export function isNangoError(err: unknown): err is NangoError {
  const isError = err instanceof Error;
  const hasStatus = isError && "status" in err;
  const hasNangoCode =
    isError && "code" in err && err.code === "ERR_BAD_RESPONSE";
  const hasConfig = isError && "config" in err;
  const hasConfigUrl =
    hasConfig &&
    err.config !== null &&
    typeof err.config === "object" &&
    "url" in err.config;

  return hasStatus && hasNangoCode && hasConfig && hasConfigUrl;
}
