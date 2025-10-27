export const mentionAgent = (agent: { name: string; sId: string }) => {
  return `:mention[${agent.name}]{sId=${agent.sId}}`;
};

export const mentionUser = (user: { fullName: string; id: number }) => {
  return `:mention[${user.fullName}]{userId=${user.id}}`;
};

const EXTRACT_MENTION_REGEX = /:mention\[([^\]]+)\]\{[^}]+\}/g;

export const replaceMentionsByAt = (m: string) => {
  return m.replaceAll(EXTRACT_MENTION_REGEX, (_, name) => {
    return `@${name}`;
  });
};
