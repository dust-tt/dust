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
  // Validate amount
  if (isNaN(amountDollars) || amountDollars <= 0) {
    sendNotification({
      type: "error",
      title: "Invalid amount",
      description: "Please enter a valid amount greater than 0",
    });
    return false;
  }

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
        description: errorMessage,
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
    sendNotification({
      type: "error",
      title: "Purchase failed",
      description:
        err instanceof Error ? err.message : "Failed to purchase credits",
    });
    return false;
  }
}
