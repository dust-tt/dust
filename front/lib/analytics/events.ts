export const OPEN_USER_ANALYTICS_EVENT = "open-user-analytics";

export class OpenUserAnalyticsEvent extends CustomEvent<void> {
  constructor() {
    super(OPEN_USER_ANALYTICS_EVENT);
  }
}
