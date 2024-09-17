import { Icon, XCircleIcon } from "@dust-tt/sparkle";

import { isConversationAccessDeniedError } from "@app/lib/conversation";

interface ConversationError {
  error: Error;
}

export function ConversationError({ error }: ConversationError) {
  const isAccessDeniedError = isConversationAccessDeniedError(error);

  if (isAccessDeniedError) {
    return <ConversationAccessDenied />;
  }

  return <>Error loading conversation</>;
}

function ConversationAccessDenied() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-1">
      <Icon visual={XCircleIcon} className="text-warning-400" size="lg" />
      <p className="text-center text-xl font-bold leading-7 text-slate-900">
        Permission Required
      </p>
      <p className="text-center text-sm font-normal leading-tight text-slate-700">
        This conversation contains protected information.
        <br />
        Request access to view it.
      </p>
    </div>
  );
}
