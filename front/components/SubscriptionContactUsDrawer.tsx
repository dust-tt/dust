import {
  ArrowRightIcon,
  Button,
  Input,
  LogoSquareColorLogo,
  Modal,
  Page,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useSubmitFunction } from "@app/lib/client/utils";
import { ClientSideTracking } from "@app/lib/tracking/client";
import { isEmailValid } from "@app/lib/utils";

export function SubscriptionContactUsDrawer({
  show,
  onClose,
  initialEmail,
}: {
  show: boolean;
  onClose: () => void;
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail || "");
  const [emailError, setEmailError] = useState<null | string>(null);

  const submit = useSubmitFunction(async () => {
    if (isEmailValid(email)) {
      setEmailError(null);
      const formURL = `https://docs.google.com/forms/d/e/1FAIpQLSdZdNPHm0J1k5SoKAoDdmnFZCzVDHUKnDE3MVM_1ii2fLrp8w/viewform?usp=pp_url&entry.1203449999=${encodeURIComponent(
        email
      )}`;
      void ClientSideTracking.trackClickEnterpriseContactUs({ email }).finally(
        () => {
          window.location.href = formURL;
        }
      );
    } else {
      setEmailError("Invalid email address.");
    }
  });

  return (
    <Modal
      isOpen={show}
      onClose={onClose}
      variant="side-sm"
      hasChanged={false}
      title="Contact Us"
    >
      <div className="mx-1 pt-8">
        <Page.Vertical gap="lg" align="stretch">
          <LogoSquareColorLogo className="h-8 w-8" />
          <div className="font-bold">
            <Page.P size="md">Let's Connect!</Page.P>
          </div>
          <Page.P size="md">
            Please share your email and answer a few questions about your
            company.
          </Page.P>
          <Page.P size="md">
            We'll be in touch shortly for an intro call.
          </Page.P>

          <Page.Vertical gap="sm" align="stretch">
            <Page.P size="md" variant="secondary">
              email
            </Page.P>
            <Input
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              error={emailError}
              name="assistantName"
              showErrorLabel
              className="text-sm"
            />
            <Page.Horizontal align="right">
              <Button
                variant="primary"
                size="md"
                icon={ArrowRightIcon}
                label=""
                labelVisible={false}
                disabledTooltip={true}
                onClick={() => submit.submit()}
              />
            </Page.Horizontal>
          </Page.Vertical>
        </Page.Vertical>
      </div>
    </Modal>
  );
}
