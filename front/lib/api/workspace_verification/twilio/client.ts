import Twilio from "twilio";

import config from "@app/lib/api/config";

let twilioClientInstance: ReturnType<typeof Twilio> | null = null;

export function getTwilioClient(): ReturnType<typeof Twilio> {
  if (twilioClientInstance) {
    return twilioClientInstance;
  }

  twilioClientInstance = Twilio(
    config.getTwilioAccountSid(),
    config.getTwilioAuthToken()
  );

  return twilioClientInstance;
}

export function getTwilioVerifyServiceSid(): string {
  return config.getTwilioVerifyServiceSid();
}
