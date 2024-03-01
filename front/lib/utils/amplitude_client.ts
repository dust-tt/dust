import type {
  Event,
  EventOptions,
  PromiseResult,
  Result,
} from "@app/lib/utils/ampli";
import { Ampli, ampli } from "@app/lib/utils/ampli";
import logger from "@app/logger/logger";

// Dev instance of Amplitude that doesn't actually send events.
export class AmpliDev extends Ampli {
  track(
    userId: string | undefined,
    event: Event,
    options?: EventOptions
  ): PromiseResult<Result> {
    logger.info("[Not tracking] Amplitude even", userId, event, options);
    return { promise: Promise.resolve() };
  }
}

let AmplitInstance: Ampli | null = null;

// Get the appropriate Amplitude instance based on the environment variables.
// The amplitude client is strongly typed based on our events and properties definitions
// in the Amplitude UI, but we don't want to actually talk to Amplitude in dev.
export function getAmplitude(): Ampli {
  if (AmplitInstance) {
    return AmplitInstance;
  }
  const { AMPLITUDE_ENV, AMPLITUDE_API_KEY } = process.env;
  if (!AMPLITUDE_ENV || !AMPLITUDE_API_KEY) {
    logger.debug("Amplitude environment variables not set, using dev instance");
    AmplitInstance = new AmpliDev();
  } else {
    AmplitInstance = ampli;
    ampli.load({
      // @ts-expect-error - the type of "environment" is auto populated by the Amplitude CLI,
      // So we can't make it typesafe.
      environment: AMPLITUDE_ENV,
      client: { apiKey: AMPLITUDE_API_KEY },
    });
  }

  return AmplitInstance;
}
