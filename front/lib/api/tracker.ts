import type { TrackerConfigurationType } from "@dust-tt/types";

import { sendEmailWithTemplate } from "@app/lib/api/email";

const TRACKER_FROM_EMAIL = "dev@dust.tt";
const TRACKER_FROM_NAME = "Bob Tracker"; // 😬

export async function sendTrackerEmailWithNoGeneration(
  tracker: TrackerConfigurationType
): Promise<void> {
  const recipients = new Set(tracker.recipients);
  if (!recipients.size) {
    throw new Error("No recipients found for tracker");
  }

  const _sendTrackerEmailWithNoGenerationToRecipient = async (
    recipient: string,
    tracker: TrackerConfigurationType
  ): Promise<void> => {
    await sendEmailWithTemplate({
      to: recipient,
      from: {
        name: TRACKER_FROM_NAME,
        email: TRACKER_FROM_EMAIL,
      },
      subject: `[Dust] Tracker ${tracker.name} check complete: No updates required.`,
      body: `
        <p>Tracker: ${tracker.name}.</p>
        <p>No changes detected in watched documents. All maintained documents are current</p>
      `,
    });
  };

  await Promise.all(
    Array.from(recipients).map((recipient) =>
      _sendTrackerEmailWithNoGenerationToRecipient(recipient, tracker)
    )
  );
}

export async function sendTrackerEmailWithGenerations(
  tracker: TrackerConfigurationType
): Promise<void> {
  const recipients = new Set(tracker.recipients);
  if (!recipients.size) {
    throw new Error("No recipients found for tracker");
  }

  const generations = tracker.generations || [];
  if (!generations?.length) {
    throw new Error("No generations found for tracker");
  }

  const _sendTrackerEmailWithNoGenerationToRecipient = async (
    recipient: string,
    tracker: TrackerConfigurationType
  ): Promise<void> => {
    const generationsBody = generations
      .map(
        (generation) => `
        <p>Generation: ${generation.id}.</p>
        <p>Changes: ${generation.content}.</p>
        <p>Document: ${generation.documentId}.</p>
        `
      )
      .join("");

    await sendEmailWithTemplate({
      to: recipient,
      from: {
        name: TRACKER_FROM_NAME,
        email: TRACKER_FROM_EMAIL,
      },
      subject: `[Dust] Tracker ${tracker.name} check complete: Updates required.`,
      body: `
        <p>Tracker: ${tracker.name}.</p>
        <p>Suggested changes detected in watched documents: ${generations.length}.</p>
        <p>Changes:</p>
        ${generationsBody}
        `,
    });
  };

  await Promise.all(
    Array.from(recipients).map((recipient) =>
      _sendTrackerEmailWithNoGenerationToRecipient(recipient, tracker)
    )
  );
}
