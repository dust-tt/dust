import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Icon,
  RocketIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

export interface EnterpriseChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName?: string;
  contactUrl: string;
  signupUrl: string;
  trackingLocation: string;
}

export function EnterpriseChoiceModal({
  isOpen,
  onClose,
  companyName,
  contactUrl,
  signupUrl,
  trackingLocation,
}: EnterpriseChoiceModalProps) {
  const handleFreeTrial = () => {
    trackEvent({
      area: TRACKING_AREAS.HOME,
      object: `${trackingLocation}_enterprise_choice`,
      action: TRACKING_ACTIONS.CLICK,
      extra: { choice: "free_trial" },
    });
    window.location.href = appendUTMParams(signupUrl);
  };

  const handleScheduleDemo = () => {
    trackEvent({
      area: TRACKING_AREAS.HOME,
      object: `${trackingLocation}_enterprise_choice`,
      action: TRACKING_ACTIONS.CLICK,
      extra: { choice: "schedule_demo" },
    });
    window.location.href = appendUTMParams(contactUrl);
  };

  const title = companyName
    ? `${companyName} might benefit from our Enterprise plan`
    : "Your team might benefit from our Enterprise plan";

  // Track modal open.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      trackEvent({
        area: TRACKING_AREAS.HOME,
        object: `${trackingLocation}_enterprise_modal`,
        action: TRACKING_ACTIONS.OPEN,
        extra: { companyName: companyName ?? "unknown" },
      });
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, trackingLocation, companyName]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          trackEvent({
            area: TRACKING_AREAS.HOME,
            object: `${trackingLocation}_enterprise_modal`,
            action: TRACKING_ACTIONS.CLOSE,
          });
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            How would you like to get started?
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleFreeTrial}
              className="group flex flex-1 flex-col items-center rounded-2xl border border-gray-200 px-5 py-6 text-center transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-md"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 transition-colors group-hover:bg-blue-200">
                <Icon visual={RocketIcon} className="text-blue-600" />
              </div>
              <span className="text-base font-semibold text-gray-900">
                Start a free trial
              </span>
              <span className="mt-1 text-sm text-gray-500">
                Get started right away with our Pro plan
              </span>
            </button>
            <button
              onClick={handleScheduleDemo}
              className="group flex flex-1 flex-col items-center rounded-2xl border border-gray-200 px-5 py-6 text-center transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 transition-colors group-hover:bg-emerald-200">
                <Icon visual={UserGroupIcon} className="text-emerald-600" />
              </div>
              <span className="text-base font-semibold text-gray-900">
                Schedule a demo
              </span>
              <span className="mt-1 text-sm text-gray-500">
                See how Enterprise features can help your team
              </span>
            </button>
          </div>
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
