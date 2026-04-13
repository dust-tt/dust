import SparkleTokens
import SwiftUI

struct ConversationListView: View {
    @Binding var searchText: String
    let groupedConversations: [(String, [Conversation])]
    let projects: [Space]
    @Binding var isProjectsExpanded: Bool
    let user: User
    let currentWorkspace: Workspace?
    let workspaces: [Workspace]
    let isLoading: Bool
    let onNewConversation: () -> Void
    let onSelectConversation: (Conversation) -> Void
    let onSelectProject: (Space) -> Void
    let onSwitchWorkspace: (Workspace) -> Void
    let onToggleReadStatus: (Conversation) -> Void
    let onDelete: (Conversation) -> Void
    let onLogout: () -> Void
    var onCatchUp: (() -> Void)?
    var onRefresh: (() async -> Void)?

    @State private var conversationToDelete: Conversation?

    var body: some View {
        VStack(spacing: 0) {
            profileSection
            conversationListSection
        }
        .background(Color.dustBackground)
        .safeAreaInset(edge: .bottom) {
            ConversationListBottomBar(
                searchText: $searchText,
                onNewConversation: onNewConversation
            )
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

    // MARK: - Projects

    private var projectsSection: some View {
        Section {
            if isProjectsExpanded {
                ForEach(projects) { project in
                    Button {
                        onSelectProject(project)
                    } label: {
                        Text(project.name)
                            .sparkleCopySm()
                            .foregroundStyle(Color.dustForeground)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                    }
                }
            }
        } header: {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isProjectsExpanded.toggle()
                }
            } label: {
                HStack(spacing: 4) {
                    Text("Projects")
                        .sparkleLabelXs()
                        .textCase(.uppercase)

                    SparkleIcon.chevronDown.image
                        .resizable()
                        .frame(width: 8, height: 8)
                        .rotationEffect(.degrees(isProjectsExpanded ? 0 : -90))

                    Spacer()
                }
                .foregroundStyle(Color.dustFaint)
                .padding(.horizontal, 12)
                .padding(.top, 16)
                .padding(.bottom, 4)
            }
        }
    }

    // MARK: - Middle: Conversation List

    private var conversationListSection: some View {
        Group {
            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(.top, 32)
            } else if groupedConversations.isEmpty {
                if searchText.isEmpty {
                    ContentUnavailableView(
                        "No conversations yet",
                        systemImage: "bubble.left.and.bubble.right"
                    )
                } else {
                    ContentUnavailableView.search(text: searchText)
                }
            } else {
                conversationList
                    .refreshable {
                        await onRefresh?()
                    }
            }
        }
        .confirmationDialog(
            "Delete conversation?",
            isPresented: Binding(
                get: { conversationToDelete != nil },
                set: { if !$0 { conversationToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let conversation = conversationToDelete {
                    onDelete(conversation)
                    conversationToDelete = nil
                }
            }
        } message: {
            Text("This action cannot be undone.")
        }
    }

    private var conversationList: some View {
        List {
            if !projects.isEmpty {
                projectsSection
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            ForEach(groupedConversations, id: \.0) { group, conversations in
                Section {
                    ForEach(conversations) { conversation in
                        Button {
                            onSelectConversation(conversation)
                        } label: {
                            ConversationRowView(conversation: conversation)
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button {
                                onToggleReadStatus(conversation)
                            } label: {
                                if conversation.unread || conversation.actionRequired {
                                    SparkleIcon.eye.image
                                } else {
                                    SparkleIcon.inbox.image
                                }
                            }
                            .tint(.blue)
                            .accessibilityLabel(
                                conversation.unread || conversation.actionRequired ? "Mark as read" : "Mark as unread"
                            )
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                conversationToDelete = conversation
                            } label: {
                                SparkleIcon.trash.image
                            }
                            .accessibilityLabel("Delete")
                        }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.dustBackground)
                        .listRowSeparator(.hidden)
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
                .listSectionSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .listSectionSpacing(0)
        .environment(\.defaultMinListRowHeight, 0)
    }
}
