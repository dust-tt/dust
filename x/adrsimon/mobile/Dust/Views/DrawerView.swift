import SparkleTokens
import SwiftUI

struct DrawerView: View {
    @Binding var searchText: String
    let groupedConversations: [(String, [Conversation])]
    let user: User
    let currentWorkspace: Workspace?
    let workspaces: [Workspace]
    let isLoading: Bool
    let onNewConversation: () -> Void
    let onSelectConversation: (Conversation) -> Void
    let onSwitchWorkspace: (Workspace) -> Void
    let onLogout: () -> Void
    var onRefresh: (() async -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            headerSection
            conversationListSection
            userSection
        }
        .background(Color.dustBackground)
    }

    // MARK: - Top: Search + New

    private var headerSection: some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                SparkleIcon.magnifyingGlass.image
                    .resizable()
                    .frame(width: 14, height: 14)
                    .foregroundStyle(Color.dustFaint)
                TextField("Search", text: $searchText)
                    .sparkleCopySm()
                    .foregroundStyle(Color.dustForeground)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .modifier(GlassSearchBarModifier())

            Button(action: onNewConversation) {
                HStack(spacing: 4) {
                    SparkleIcon.chatBubbleBottomCenterPlus.image
                        .resizable()
                        .frame(width: 14, height: 14)
                    Text("New")
                        .sparkleLabelSm()
                }
                .foregroundStyle(Color.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.gray950)
                .clipShape(RoundedRectangle(cornerRadius: 32))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }

    // MARK: - Middle: Conversation List

    private var conversationListSection: some View {
        ScrollView {
            if isLoading {
                ProgressView()
                    .padding(.top, 32)
            } else if groupedConversations.isEmpty {
                Text("No conversations yet")
                    .sparkleCopySm()
                    .foregroundStyle(Color.dustFaint)
                    .padding(.top, 32)
            } else {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(groupedConversations, id: \.0) { group, conversations in
                        Section {
                            ForEach(conversations) { conversation in
                                Button {
                                    onSelectConversation(conversation)
                                } label: {
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

                                        Text(conversation.title ?? "New conversations")
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
                        } header: {
                            Text(group)
                                .sparkleLabelXs()
                                .textCase(.uppercase)
                                .foregroundStyle(Color.dustFaint)
                                .padding(.horizontal, 12)
                                .padding(.top, 16)
                                .padding(.bottom, 4)
                        }
                        .background(Color.clear)
                    }
                }
            }
        }
        .refreshable {
            await onRefresh?()
        }
        .frame(maxHeight: .infinity)
    }

    // MARK: - Bottom: User Profile + Logout

    private var userSection: some View {
        HStack(spacing: 10) {
            HStack(spacing: 10) {
                Avatar(url: user.profilePictureUrl, size: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text(user.displayName)
                        .sparkleCopySm()
                        .foregroundStyle(Color.dustForeground)
                        .lineLimit(1)

                    if let workspace = currentWorkspace {
                        Text(workspace.name)
                            .sparkleCopyXs()
                            .foregroundStyle(Color.dustFaint)
                            .lineLimit(1)
                    }
                }
            }
            .padding(8)
            .contentShape(RoundedRectangle(cornerRadius: 12))
            .contextMenu {
                if workspaces.count > 1 {
                    ForEach(workspaces) { workspace in
                        Button {
                            onSwitchWorkspace(workspace)
                        } label: {
                            Label {
                                Text(workspace.name)
                            } icon: {
                                (workspace.sId == currentWorkspace?.sId
                                    ? SparkleIcon.checkCircle : SparkleIcon.circle).image
                            }
                        }
                    }
                }
            }

            Spacer()

            Button(action: onLogout) {
                Text("Logout")
                    .sparkleLabelXs()
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.gray950)
                    .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
    }
}

private struct GlassSearchBarModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.interactive(), in: .capsule)
        } else {
            content
                .background(Color.dustBackground)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }
}
