import type { WebhookSourceWithViews } from "@app/types/triggers/webhooks";

export const filterWebhookSource = (
  webhookSource: WebhookSourceWithViews,
  filterValue: string
) => {
  {
    return (
      webhookSource.name.toLowerCase().includes(filterValue.toLowerCase()) ||
      webhookSource.views.some(
        (view) =>
          view?.customName !== null &&
          view?.customName.toLowerCase().includes(filterValue.toLowerCase())
      )
    );
  }
};
