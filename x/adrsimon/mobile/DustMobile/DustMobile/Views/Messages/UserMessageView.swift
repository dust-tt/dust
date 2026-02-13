import SwiftUI

struct UserMessageView: View {
    let message: UserMessageType

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Spacer(minLength: 60)

            VStack(alignment: .trailing, spacing: 4) {
                Text(message.content)
                    .font(.body)
                    .padding(12)
                    .background(Color.blue)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                HStack(spacing: 4) {
                    if let user = message.user {
                        Text(user.firstName)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    Text(Date(timeIntervalSince1970: TimeInterval(message.created / 1000)).formatted(date: .omitted, time: .shortened))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            // Avatar
            if let imageUrl = message.user?.image, let url = URL(string: imageUrl) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Circle().fill(Color.gray.opacity(0.3))
                }
                .frame(width: 28, height: 28)
                .clipShape(Circle())
            } else {
                Circle()
                    .fill(Color.blue.opacity(0.2))
                    .frame(width: 28, height: 28)
                    .overlay(
                        Text(String(message.user?.firstName.prefix(1) ?? "U").uppercased())
                            .font(.caption2.bold())
                            .foregroundStyle(.blue)
                    )
            }
        }
    }
}
