import config from "@app/lib/api/config";
import Twilio from "twilio";

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
