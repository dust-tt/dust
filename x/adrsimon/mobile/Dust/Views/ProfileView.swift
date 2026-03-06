import SwiftUI

struct ProfileView: View {
    let user: User
    let onLogout: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 16) {
                        AsyncProfileImage(url: user.profilePictureUrl)
                            .frame(width: 64, height: 64)

                        VStack(alignment: .leading, spacing: 4) {
                            Text(user.displayName)
                                .font(.title3)
                                .fontWeight(.semibold)

                            Text(user.email)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 8)
                }

                Section("Account Details") {
                    LabeledContent("WorkOS User ID", value: user.id)

                    LabeledContent("Email Verified") {
                        Image(systemName: user.emailVerified ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(user.emailVerified ? .green : .red)
                    }

                    if let firstName = user.firstName {
                        LabeledContent("First Name", value: firstName)
                    }

                    if let lastName = user.lastName {
                        LabeledContent("Last Name", value: lastName)
                    }
                }

                Section {
                    Button("Log Out", role: .destructive) {
                        onLogout()
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }
}

private struct AsyncProfileImage: View {
    let url: String?

    var body: some View {
        if let url, let imageURL = URL(string: url) {
            AsyncImage(url: imageURL) { phase in
                switch phase {
                case let .success(image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .clipShape(Circle())
                default:
                    placeholder
                }
            }
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        Circle()
            .fill(.quaternary)
            .overlay {
                Image(systemName: "person.fill")
                    .font(.title2)
                    .foregroundStyle(.secondary)
            }
    }
}
