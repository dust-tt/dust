import SparkleTokens
import SwiftUI

struct PodConversationRowView: View {
    private static let avatarBoxSize: CGFloat = 36
    private static let stackedAvatarSize: CGFloat = 24

    let title: String
    let snippet: String?
    let avatarUrls: [String]
    let isUnread: Bool

    var body: some View {
        HStack(spacing: 12) {
            avatars

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(title)
                        .sparkleLabelSm()
                        .foregroundStyle(Color.dustForeground)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if isUnread {
                        Circle()
                            .fill(Color.highlight500)
                            .frame(width: 8, height: 8)
                    }
                }

                Text(snippet ?? " ")
                    .sparkleCopySm()
                    .foregroundStyle(Color.dustFaint)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private var avatars: some View {
        switch avatarUrls.count {
        case 0, 1:
            Avatar(url: avatarUrls.first, size: Self.avatarBoxSize)
        default:
            ZStack {
                stackedAvatar { Avatar(url: avatarUrls[0], size: Self.stackedAvatarSize) }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                stackedAvatar {
                    if avatarUrls.count == 2 {
                        Avatar(url: avatarUrls[1], size: Self.stackedAvatarSize)
                    } else {
                        moreAvatar
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            }
            .frame(width: Self.avatarBoxSize, height: Self.avatarBoxSize)
        }
    }

    private var moreAvatar: some View {
        Circle()
            .fill(Color.dustMutedBackground)
            .frame(width: Self.stackedAvatarSize, height: Self.stackedAvatarSize)
            .overlay {
                Image(systemName: "plus")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Color.dustFaint)
            }
    }

    private func stackedAvatar(@ViewBuilder _ content: () -> some View) -> some View {
        content()
            .padding(1.5)
            .background(Color.dustBackground, in: Circle())
    }
}
