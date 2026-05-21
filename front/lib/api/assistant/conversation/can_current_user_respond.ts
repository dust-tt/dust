/**
 * Whether the current user may respond to a blocked action or mention tied to a
 * parent user message. When the parent message has no associated user (e.g. API
 * key auth), any authenticated viewer may respond.
 */
export function canCurrentUserRespondToParentUserMessage<
  TId extends string | number,
>({
  parentUserId,
  currentUserId,
}: {
  parentUserId: TId | null | undefined;
  currentUserId: TId | undefined;
}): boolean {
  return parentUserId == null || parentUserId === currentUserId;
}
