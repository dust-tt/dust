import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DustLogoSquare,
  Input,
  Page,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import React, { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import { isWorkspaceElligibleForTrial } from "@app/pages/api/auth/trial";
import type { WorkspaceType } from "@app/types";

// NOTE: This is a limited list of country codes for demonstration purposes.
// To refactor to have a complete list.
const COUNTRY_CODES = [
  { code: "+33", flag: "\u{1F1EB}\u{1F1F7}", country: "France" },
  { code: "+1", flag: "\u{1F1FA}\u{1F1F8}", country: "United States" },
  { code: "+44", flag: "\u{1F1EC}\u{1F1E7}", country: "United Kingdom" },
  { code: "+49", flag: "\u{1F1E9}\u{1F1EA}", country: "Germany" },
  { code: "+34", flag: "\u{1F1EA}\u{1F1F8}", country: "Spain" },
  { code: "+39", flag: "\u{1F1EE}\u{1F1F9}", country: "Italy" },
  { code: "+81", flag: "\u{1F1EF}\u{1F1F5}", country: "Japan" },
  { code: "+86", flag: "\u{1F1E8}\u{1F1F3}", country: "China" },
  { code: "+91", flag: "\u{1F1EE}\u{1F1F3}", country: "India" },
  { code: "+61", flag: "\u{1F1E6}\u{1F1FA}", country: "Australia" },
];

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  owner: WorkspaceType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  const isValidForTrial = await isWorkspaceElligibleForTrial(auth);
  if (!isValidForTrial) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
    },
  };
});

// NOTE: This will change it's a placeholder implementation for now.
// We will rework phone verification as part of the task implementing the phone validation service.
function isValidPhoneNumber(phone: string): boolean {
  const digitsOnly = phone.replace(/[\s\-().]/g, "");
  return /^\d{6,15}$/.test(digitsOnly);
}

export default function Verify({
  owner: _owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useSendNotification();

  const [countryCode, setCountryCode] = useState("+33");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

  const sendCode = async () => {
    setError(null);

    if (!phoneNumber.trim()) {
      setError("Please enter your phone number.");
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      setError("Please enter a valid phone number (digits only, 6-15 digits).");
      return;
    }

    // TODO: Integrate with SMS service to send the code and redirect to a code verification page.
    await sendNotification({
      type: "success",
      title: "SMS code sent",
      description: `An SMS code has been sent to ${countryCode} ${phoneNumber}.`,
    });
  };

  return (
    <Page>
      <div className="flex h-full flex-col justify-center">
        <Page.Horizontal>
          <Page.Vertical sizing="grow" gap="lg">
            <Page.Header
              title="Phone number"
              icon={() => <DustLogoSquare className="-ml-11 h-10 w-32" />}
            />
            <p className="-mt-4 text-muted-foreground dark:text-muted-foreground-night">
              To start your free trial, we need to verify your account with an
              SMS code. <br />
              Your number will only be used for this verification.
            </p>

            <div className="flex w-full max-w-xl flex-col gap-4">
              <div className="flex w-full flex-col gap-2">
                <label className="text-sm font-medium text-foreground dark:text-foreground-night">
                  Phone number
                </label>
                <div className="flex w-full flex-row items-stretch">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-r-none border-r-0"
                        label={`${selectedCountry?.flag} ${countryCode}`}
                        isSelect={true}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuRadioGroup
                        value={countryCode}
                        onValueChange={setCountryCode}
                      >
                        {COUNTRY_CODES.map((country) => (
                          <DropdownMenuRadioItem
                            key={country.code}
                            value={country.code}
                            label={`${country.flag} ${country.code} ${country.country}`}
                          />
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="min-w-0 flex-1">
                    <Input
                      name="phoneNumber"
                      placeholder=""
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value);
                        setError(null);
                      }}
                      className="w-full rounded-l-none"
                    />
                  </div>
                </div>
                <p className="min-h-5 text-sm text-red-500">{error}</p>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={sendCode}
                  variant="primary"
                  label="Send code"
                />
              </div>
            </div>
          </Page.Vertical>
        </Page.Horizontal>
      </div>
    </Page>
  );
}
