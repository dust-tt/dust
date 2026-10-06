import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  ContentMessage,
  ContentMessageAction,
  InfoCircle,
  RefreshCw02,
  UsersPlus,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

type BuilderType = "agent" | "skill";

interface BuilderEditorGateMessageProps {
  builderType: BuilderType;
  disabled?: boolean;
  isLoading?: boolean;
  onAddSelfAsEditor: () => void;
}

export function BuilderEditorGateMessage({
  builderType,
  disabled = false,
  isLoading = false,
  onAddSelfAsEditor,
}: BuilderEditorGateMessageProps) {
  const { t } = useLingui();

  const getTexts = () => {
    switch (builderType) {
      case "agent":
        return {
          title: t`You are not an editor of this agent`,
          body: (
            <Trans>
              You can view this agent as a workspace admin. Become an editor to
              save changes.
            </Trans>
          ),
        };
      case "skill":
        return {
          title: t`You are not an editor of this skill`,
          body: (
            <Trans>
              You can view this skill as a workspace admin. Become an editor to
              save changes.
            </Trans>
          ),
        };
      default:
        assertNever(builderType);
    }
  };
  const { title, body } = getTexts();

  return (
    <ContentMessage
      title={title}
      variant="golden"
      icon={InfoCircle}
      size="lg"
      action={
        <ContentMessageAction
          icon={UsersPlus}
          label={isLoading ? t`Becoming an editor...` : t`Become an editor`}
          variant="primary"
          disabled={disabled || isLoading}
          onClick={onAddSelfAsEditor}
        />
      }
    >
      {body}
    </ContentMessage>
  );
}

interface BuilderEditorLoadErrorMessageProps {
  builderType: BuilderType;
  disabled?: boolean;
  onRetry: () => void;
}

export function BuilderEditorLoadErrorMessage({
  builderType,
  disabled = false,
  onRetry,
}: BuilderEditorLoadErrorMessageProps) {
  const { t } = useLingui();

  const getBody = () => {
    switch (builderType) {
      case "agent":
        return (
          <Trans>
            We could not load the agent editors. Retry before making changes.
          </Trans>
        );
      case "skill":
        return (
          <Trans>
            We could not load the skill editors. Retry before making changes.
          </Trans>
        );
      default:
        assertNever(builderType);
    }
  };

  return (
    <ContentMessage
      title={t`Unable to verify editor access`}
      variant="warning"
      icon={InfoCircle}
      size="lg"
      action={
        <ContentMessageAction
          icon={RefreshCw02}
          label={t`Retry`}
          variant="warning"
          disabled={disabled}
          onClick={onRetry}
        />
      }
    >
      {getBody()}
    </ContentMessage>
  );
}
