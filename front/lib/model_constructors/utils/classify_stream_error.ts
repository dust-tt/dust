import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  ErrorEvent,
  ErrorSource,
  ErrorType,
} from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";

export type StreamErrorSdkClass = "connection" | "abort" | "timeout";

type ErrorSignal = {
  code?: string;
  message: string;
  name?: string;
};

const ABORT_ERROR_CODES = new Set(["abort_err", "und_err_aborted"]);

const NETWORK_ERROR_CODES = new Set([
  "eai_again",
  "econnaborted",
  "econnrefused",
  "econnreset",
  "ehostunreach",
  "enetunreach",
  "enotfound",
  "epipe",
  "und_err_socket",
]);

const TIMEOUT_ERROR_CODES = new Set([
  "etimedout",
  "und_err_body_timeout",
  "und_err_connect_timeout",
  "und_err_headers_timeout",
]);

const STREAM_ERROR_CODES = new Set(["err_stream_premature_close"]);

// DOM / undici constructor names. Exact match on `error.name` / `cause.name`.
const ABORT_ERROR_NAMES = new Set(["aborterror"]);

const NETWORK_ERROR_NAMES = new Set(["socketerror"]);

const TIMEOUT_ERROR_NAMES = new Set([
  "bodytimeouterror",
  "connecttimeouterror",
  "headerstimeouterror",
  "timeouterror",
]);

function getErrorSignals(error: unknown): ErrorSignal[] {
  const signals: ErrorSignal[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);

    const signal: ErrorSignal = {
      message: normalizeError(current).message,
    };
    if (typeof current === "object") {
      if ("name" in current && isString(current.name)) {
        signal.name = current.name;
      }
      if ("code" in current && isString(current.code)) {
        signal.code = current.code;
      }
    }
    signals.push(signal);

    if (typeof current !== "object" || !("cause" in current)) {
      break;
    }
    current = current.cause;
  }

  return signals;
}

function hasAny(values: Set<string>, known: Set<string>): boolean {
  return [...values].some((value) => known.has(value));
}

function firstCodeIn(
  signalCodes: string[],
  known: Set<string>
): string | undefined {
  return signalCodes.find((code) => known.has(code.toLowerCase()));
}

/**
 * Classifies an otherwise-untyped error thrown while calling or consuming an
 * LLM provider. Only machine-stable identity is used:
 * - `code` and `name` on the error and its cause chain
 * - `sdkClass` when the adapter already identified the SDK error class
 *
 * Free-form messages are never matched. `errorSource` is who is at fault.
 * A socket drop or timeout is not enough to blame the provider, so those
 * stay `"unknown"`. Typed HTTP and in-band provider errors remain the
 * responsibility of each provider adapter.
 */
export function classifyStreamError({
  error,
  metadata,
  providerName,
  sdkClass,
}: {
  error: unknown;
  metadata: EndpointMetadata;
  providerName: string;
  sdkClass?: StreamErrorSdkClass;
}): ErrorEvent {
  const signals = getErrorSignals(error);
  const normalizedMessage = normalizeError(error).message;
  const codes = new Set(
    signals
      .map(({ code }) => code?.toLowerCase())
      .filter((code): code is string => code !== undefined)
  );
  const names = new Set(
    signals
      .map(({ name }) => name?.toLowerCase())
      .filter((name): name is string => name !== undefined)
  );
  const signalCodes = signals
    .map(({ code }) => code)
    .filter((code): code is string => code !== undefined);

  const isAbort =
    sdkClass === "abort" ||
    hasAny(codes, ABORT_ERROR_CODES) ||
    hasAny(names, ABORT_ERROR_NAMES);
  const isTimeout =
    sdkClass === "timeout" ||
    hasAny(codes, TIMEOUT_ERROR_CODES) ||
    hasAny(names, TIMEOUT_ERROR_NAMES);
  const isNetwork =
    hasAny(codes, NETWORK_ERROR_CODES) || hasAny(names, NETWORK_ERROR_NAMES);
  const isStream = hasAny(codes, STREAM_ERROR_CODES);

  let type: ErrorType;
  let errorSource: ErrorSource;
  let prefix: string;
  let detailCode: string | undefined;

  if (isAbort) {
    type = "unknown_error";
    errorSource = "unknown";
    prefix = `Request to ${providerName} was aborted`;
    detailCode = firstCodeIn(signalCodes, ABORT_ERROR_CODES);
  } else if (isTimeout) {
    type = "timeout_error";
    errorSource = "unknown";
    prefix = `Request to ${providerName} timed out`;
    detailCode = firstCodeIn(signalCodes, TIMEOUT_ERROR_CODES);
  } else if (isNetwork || sdkClass === "connection") {
    type = "network_error";
    errorSource = "unknown";
    prefix = `Network error connecting to ${providerName}`;
    detailCode = firstCodeIn(signalCodes, NETWORK_ERROR_CODES);
  } else if (isStream) {
    type = "stream_error";
    errorSource = "unknown";
    prefix = `Stream error from ${providerName}`;
    detailCode = firstCodeIn(signalCodes, STREAM_ERROR_CODES);
  } else {
    type = "unknown_error";
    errorSource = "unknown";
    prefix = `Unknown error from ${providerName}`;
  }

  const causeCode = detailCode ?? signalCodes[0];
  const details =
    causeCode !== undefined &&
    !normalizedMessage.toLowerCase().includes(causeCode.toLowerCase())
      ? `${normalizedMessage} (${causeCode})`
      : normalizedMessage;

  return buildErrorEvent({
    errorSource,
    type,
    message: `${prefix}: ${details}`,
    metadata,
    originalError: error,
  });
}
