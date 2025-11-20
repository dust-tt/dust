import type { NotificationType } from "@dust-tt/sparkle";

/**
 * Purchase credits for a workspace through Stripe.
 *
 * @param workspaceId - The workspace ID to purchase credits for
 * @param amountDollars - The amount in USD to purchase
 * @param sendNotification - Function to send toast notifications
 * @returns Promise<boolean> - true if purchase was successful, false otherwise
 */
export async function purchaseCredits({
  workspaceId,
  amountDollars,
  sendNotification,
}: {
  workspaceId: string;
  amountDollars: number;
  sendNotification: (notificationData: NotificationType) => void;
}): Promise<boolean> {
  try {
    const response = await fetch(`/api/w/${workspaceId}/credits/purchase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amountDollars }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage =
        errorData.error?.message || "Failed to purchase credits";

      sendNotification({
        type: "error",
        title: "Purchase failed",
        description: `${errorMessage}. Please contact support if the issue persists.`,
      });
      return false;
    }

    sendNotification({
      type: "success",
      title: "Credits purchased",
      description: `Successfully added $${amountDollars} in credits`,
    });
    return true;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Failed to purchase credits";

    sendNotification({
      type: "error",
      title: "Purchase failed",
      description: `${errorMessage}. Please contact support if the issue persists.`,
    });
    return false;
  }
}
