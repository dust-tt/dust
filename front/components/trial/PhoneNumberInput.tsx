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
import type { Country } from "react-phone-number-input";
import PhoneInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";

interface CountrySelectComponentProps {
  value?: string;
  onChange: (value?: string) => void;
  options: { value?: string; label: string; divider?: boolean }[];
  iconComponent?: React.ComponentType<{ country?: string; label?: string }>;
  disabled?: boolean;
  readOnly?: boolean;
}

const CountrySelectComponent = ({
  value,
  onChange,
  options,
  iconComponent: IconComponent,
  disabled,
  readOnly,
}: CountrySelectComponentProps) => {
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled ?? readOnly}>
        <Button
          variant="outline"
          className="rounded-r-none border-r-0 px-3"
          isSelect={true}
          label={selectedOption?.value ?? "-"}
          icon={() =>
            IconComponent &&
            value && (
              <div className="h-4 w-6 overflow-hidden rounded-sm">
                <IconComponent country={value} label={selectedOption?.label} />
              </div>
            )
          }
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options
            .filter((country) => country.value !== undefined)
            .map((country) => (
              <DropdownMenuRadioItem
                key={country.value ?? "-"}
                value={country.value ?? "-"}
                label={country.label ?? "-"}
                icon={() =>
                  IconComponent && country.value ? (
                    <div className="h-4 w-6 overflow-hidden rounded-sm">
                      <IconComponent
                        country={country.value}
                        label={country.label}
                      />
                    </div>
                  ) : undefined
                }
              />
            ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface InputComponentProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange"
> {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  country?: string;
  metadata?: unknown;
}

const InputComponent = React.forwardRef<HTMLInputElement, InputComponentProps>(
  ({ value, onChange, className, ...props }, ref) => {
    return (
      <div className="min-w-0 flex-1">
        <Input
          {...props}
          ref={ref}
          name="phoneNumber"
          placeholder=""
          value={value}
          onChange={onChange}
          className={`w-full rounded-l-none ${className ?? ""}`}
        />
      </div>
    );
  }
);

InputComponent.displayName = "InputComponent";

interface PhoneNumberInputProps {
  countryCode: Country;
  phoneNumber: string;
  onCountryCodeChange: (country?: Country) => void;
  onPhoneNumberChange: (phone: string) => void;
}

export function PhoneNumberInput({
  countryCode,
  phoneNumber,
  onCountryCodeChange,
  onPhoneNumberChange,
}: PhoneNumberInputProps) {
  return (
    <PhoneInput
      className="flex w-full flex-row items-stretch"
      value={phoneNumber}
      onChange={(value) => onPhoneNumberChange(value?.toString() ?? "")}
      defaultCountry={countryCode}
      country={countryCode}
      onCountryChange={onCountryCodeChange}
      flags={flags}
      countrySelectComponent={CountrySelectComponent}
      inputComponent={InputComponent}
    />
  );
}
