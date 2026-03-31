import type {
  TeamsChannel,
  TeamsChat,
  TeamsMeeting,
  TeamsUser,
} from "@app/lib/api/actions/servers/microsoft/utils";

export function renderUsers(users: TeamsUser[]): string {
  if (users.length === 0) {
    return "No users found.";
  }

  return users
    .map((user) => {
      const lines = [
        `ID: ${user.id}`,
        `Display Name: ${user.displayName}`,
        `Principal Name: ${user.userPrincipalName}`,
      ];

      if (user.mail) {
        lines.push(`Mail: ${user.mail}`);
      }

      return lines.join("\n");
    })
    .join("\n-----\n");
}

export function renderChannels(channels: TeamsChannel[]): string {
  if (channels.length === 0) {
    return "No channels found.";
  }

  return channels
    .map((channel) => {
      const lines = [
        `ID: ${channel.id}`,
        `Display Name: ${channel.displayName}`,
        `Email: ${channel.email}`,
        `Web URL: ${channel.webUrl}`,
        `Created: ${new Date(channel.createdDateTime).toISOString()}`,
      ];

      if (channel.description) {
        lines.push(`Description: ${channel.description}`);
      }

      if (channel.tenantId) {
        lines.push(`Tenant ID: ${channel.tenantId}`);
      }

      return lines.join("\n");
    })
    .join("\n-----\n");
}

export function renderChats(chats: TeamsChat[]): string {
  if (chats.length === 0) {
    return "No chats found.";
  }

  return chats
    .map((chat) => {
      const lines = [
        `ID: ${chat.id}`,
        `Chat Type: ${chat.chatType}`,
        `Web URL: ${chat.webUrl}`,
        `Created: ${new Date(chat.createdDateTime).toISOString()}`,
        `Last Updated: ${new Date(chat.lastMessagePreview?.createdDateTime ?? chat.lastUpdatedDateTime).toISOString()}`,
      ];

      if (chat.topic) {
        lines.push(`Topic: ${chat.topic}`);
      }

      if (chat.tenantId) {
        lines.push(`Tenant ID: ${chat.tenantId}`);
      }

      return lines.join("\n");
    })
    .join("\n-----\n");
}

export function renderMeetings(meetings: TeamsMeeting[]): string {
  if (meetings.length === 0) {
    return "No meetings found.";
  }

  return meetings
    .map((meeting) => {
      const lines = [
        `ID: ${meeting.id}`,
        `Subject: ${meeting.subject}`,
        `Start: ${meeting.start.dateTime} (${meeting.start.timeZone})`,
        `End: ${meeting.end.dateTime} (${meeting.end.timeZone})`,
        `Organizer: ${meeting.organizer.emailAddress.name} (${meeting.organizer.emailAddress.address})`,
      ];

      if (meeting.attendees?.length > 0) {
        const attendeeList = meeting.attendees
          .map((a) => `${a.emailAddress.name} (${a.emailAddress.address})`)
          .join(", ");
        lines.push(`Attendees: ${attendeeList}`);
      }

      lines.push(`Web Link: ${meeting.webLink}`);

      if (meeting.onlineMeeting?.joinUrl) {
        lines.push(`Join URL: ${meeting.onlineMeeting.joinUrl}`);
      }

      return lines.join("\n");
    })
    .join("\n-----\n");
}
