import SparkleTokens
import SwiftUI

struct ConversationListView: View {
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
    var onCatchUp: (() -> Void)?
    var onRefresh: (() async -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            profileSection
            conversationListSection
        }
        .background(Color.dustBackground)
        .safeAreaInset(edge: .bottom) {
            bottomBar
        }
    }

    // MARK: - Top: Profile + Catch Up

    private var profileSection: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Avatar(url: user.profilePictureUrl, size: 32)

                Text(user.displayName)
                    .sparkleCopySm()
                    .foregroundStyle(Color.dustForeground)
                    .lineLimit(1)

                Spacer()

                workspaceMenu
            }

            if let onCatchUp {
                Button(action: onCatchUp) {
                    HStack(spacing: 6) {
                        SparkleIcon.inbox.image
                            .resizable()
                            .frame(width: 14, height: 14)
                        Text("Catch Up")
                            .sparkleLabelSm()
                    }
                    .foregroundStyle(Color.dustForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.dustMutedBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var workspaceMenu: some View {
        Menu {
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

                Divider()
            }

            Button(role: .destructive, action: onLogout) {
                Label("Logout", systemImage: "rectangle.portrait.and.arrow.right")
            }
        } label: {
            HStack(spacing: 4) {
                Text(currentWorkspace?.name ?? "Workspace")
                    .sparkleLabelSm()
                    .lineLimit(1)
                SparkleIcon.chevronDown.image
                    .resizable()
                    .frame(width: 10, height: 10)
            }
            .foregroundStyle(Color.dustForeground)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .liquidGlassCapsule()
    }

    // MARK: - Middle: Conversation List

    private var conversationListSection: some View {
        ScrollView {
            if isLoading {
                ProgressView()
                    .padding(.top, 32)
            } else if groupedConversations.isEmpty {
                if searchText.isEmpty {
                    ContentUnavailableView(
                        "No conversations yet",
                        systemImage: "bubble.left.and.bubble.right"
                    )
                    .padding(.top, 32)
                } else {
                    ContentUnavailableView.search(text: searchText)
                        .padding(.top, 32)
                }
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
                        } header: {
                            Text(group)
                                .sparkleLabelXs()
                                .textCase(.uppercase)
                                .foregroundStyle(Color.dustFaint)
                                .padding(.horizontal, 12)
                                .padding(.top, 16)
                                .padding(.bottom, 4)
                        }
                    }
                }
            }
        }
        .refreshable {
            await onRefresh?()
        }
    }

    // MARK: - Bottom: Search + New

    private var bottomBar: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                SparkleIcon.magnifyingGlass.image
                    .resizable()
                    .frame(width: 14, height: 14)
                    .foregroundStyle(Color.dustFaint)
                TextField("Search", text: $searchText)
                    .sparkleCopySm()
                    .foregroundStyle(Color.dustForeground)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .liquidGlassCapsule()

            Button(action: onNewConversation) {
                SparkleIcon.chatBubbleBottomCenterPlus.image
                    .resizable()
                    .frame(width: 20, height: 20)
                    .foregroundStyle(Color.dustForeground)
                    .padding(12)
            }
            .liquidGlassCircle()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }
}
