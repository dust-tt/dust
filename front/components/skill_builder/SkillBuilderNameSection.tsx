import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { Input } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

const NAME_FIELD_NAME = "name";

export function SkillBuilderNameSection() {
  const { t } = useLingui();

  return (
    <BaseFormFieldSection
      className="space-y-2"
      title={t`Name`}
      fieldName={NAME_FIELD_NAME}
      triggerValidationOnChange={false}
    >
      {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
        <Input
          ref={registerRef}
          placeholder={t`Enter skill name`}
          onChange={onChange}
          message={errorMessage}
          messageStatus={hasError ? "error" : "default"}
          {...registerProps}
        />
      )}
    </BaseFormFieldSection>
  );
}
