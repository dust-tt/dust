import type { TrackerGenerationToProcess } from "@dust-tt/types";

import { sendEmailWithTemplate } from "@app/lib/api/email";

const TRACKER_FROM_EMAIL = "dev@dust.tt";
const TRACKER_FROM_NAME = "Bob Tracker"; // 😬

export async function sendTrackerEmail({
  name,
  recipients,
  generations,
}: {
  name: string;
  recipients: string[];
  generations: TrackerGenerationToProcess[];
}): Promise<void> {
  const uniqueRecipients = new Set(recipients);
  if (!uniqueRecipients.size) {
    throw new Error("No recipients found for tracker");
  }

  const sendEmail =
    generations.length > 0
      ? _sendTrackerWithGenerationEmail
      : _sendTrackerDefaultEmail;

  await Promise.all(
    Array.from(recipients).map((recipient) =>
      sendEmail({ name, recipient, generations })
    )
  );
}

const _sendTrackerDefaultEmail = async ({
  name,
  recipient,
}: {
  name: string;
  recipient: string;
}): Promise<void> => {
  await sendEmailWithTemplate({
    to: recipient,
    from: {
      name: TRACKER_FROM_NAME,
      email: TRACKER_FROM_EMAIL,
    },
    subject: `[Dust] Tracker ${name} check complete: No updates required.`,
    body: `
        <p>Tracker: ${name}.</p>
        <p>No changes detected in watched documents. All maintained documents are current</p>
      `,
  });
};

const _sendTrackerWithGenerationEmail = async ({
  name,
  recipient,
  generations,
}: {
  name: string;
  recipient: string;
  generations: TrackerGenerationToProcess[];
}): Promise<void> => {
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
    subject: `[Dust] Tracker ${name} check complete: Updates required.`,
    body: `
        <p>Tracker: ${name}.</p>
        <p>Suggested changes detected in watched documents: ${generations.length}.</p>
        <p>Changes:</p>
        ${generationsBody}
        `,
  });
};
