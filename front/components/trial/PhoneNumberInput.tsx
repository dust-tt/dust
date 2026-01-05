import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Input,
} from "@dust-tt/sparkle";
import React from "react";

import { COUNTRY_CODES } from "@app/pages/api/auth/phone_verification";

interface PhoneNumberInputProps {
  countryCode: string;
  phoneNumber: string;
  onCountryCodeChange: (code: string) => void;
  onPhoneNumberChange: (phone: string) => void;
}

export function PhoneNumberInput({
  countryCode,
  phoneNumber,
  onCountryCodeChange,
  onPhoneNumberChange,
}: PhoneNumberInputProps) {
  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

  return (
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
            onValueChange={onCountryCodeChange}
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
          onChange={(e) => onPhoneNumberChange(e.target.value)}
          className="w-full rounded-l-none"
        />
      </div>
    </div>
  );
}
