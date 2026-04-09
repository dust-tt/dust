import SparkleTokens
import SwiftUI

struct ConversationRowView: View {
    let conversation: Conversation

    var body: some View {
        HStack(spacing: 6) {
            if conversation.actionRequired {
                Circle()
                    .fill(Color.golden400)
                    .frame(width: 8, height: 8)
            } else if conversation.unread {
                Circle()
                    .fill(Color.highlight500)
                    .frame(width: 8, height: 8)
            }

            Text(conversation.title ?? "New conversation")
                .sparkleCopySm()
                .foregroundStyle(Color.dustForeground)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}
