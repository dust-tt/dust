import SparkleTokens
import SwiftUI

struct ConversationListView: View {
    private static let collapsedPodCount = 4
    private static let horizontalPadding: CGFloat = 16
    private static let inboxInset: CGFloat = 10
    private static let inboxCornerRadius: CGFloat = 16

    @Binding var searchText: String
    let inboxConversations: [Conversation]
    let groupedConversations: [(String, [Conversation])]
    let pods: [Space]
    @Binding var showsAllPods: Bool
    let user: User
    let currentWorkspace: Workspace?
    let workspaces: [Workspace]
    let isLoading: Bool
    let isSearching: Bool
    let hasMoreConversations: Bool
    let onNewConversation: () -> Void
    let onSelectConversation: (Conversation) -> Void
    let onSelectPod: (Space) -> Void
    let onBrowsePods: () -> Void
    let onSwitchWorkspace: (Workspace) -> Void
    let onToggleReadStatus: (Conversation) -> Void
    let onDelete: (Conversation) -> Void
    let onLogout: () -> Void
    let onCatchUp: () -> Void
    let onLoadMoreConversations: () async -> Void
    var onRefresh: (() async -> Void)?

    @State private var conversationToDelete: Conversation?

    var body: some View {
        VStack(spacing: 0) {
            profileSection
            content
        }
        .background(Color.dustMutedBackground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            ConversationListBottomBar(
                searchText: $searchText,
                onNewConversation: onNewConversation
            )
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

    // MARK: - Profile

    private var profileSection: some View {
        HStack(spacing: 10) {
            Avatar(url: user.profilePictureUrl, size: 32)

            Text(user.displayName)
                .sparkleCopySm()
                .foregroundStyle(Color.dustForeground)
                .lineLimit(1)

            Spacer()

            workspaceMenu
        }
        .padding(.horizontal, Self.horizontalPadding)
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

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if isLoading || isSearching {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if !searchText.isEmpty, inboxConversations.isEmpty, groupedConversations.isEmpty {
            ContentUnavailableView.search(text: searchText)
        } else {
            List {
                if !inboxConversations.isEmpty {
                    inboxSection
                }
                if searchText.isEmpty, !pods.isEmpty {
                    podsSection
                }
                conversationsSection
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .environment(\.defaultMinListRowHeight, 0)
            .refreshable {
                await onRefresh?()
            }
        }
    }

    // MARK: - Inbox

    @ViewBuilder
    private var inboxSection: some View {
        inboxHeader
            .padding(.horizontal, Self.inboxInset)
            .padding(.top, 14)
            .padding(.bottom, 4)
            .plainRow(background: inboxCard(isFirst: true, isLast: false))

        ForEach(Array(inboxConversations.enumerated()), id: \.element.id) { index, conversation in
            conversationRow(conversation)
                .padding(.horizontal, Self.inboxInset)
                .padding(.bottom, index == inboxConversations.count - 1 ? 8 : 0)
                .plainRow(background: inboxCard(isFirst: false, isLast: index == inboxConversations.count - 1))
        }
    }

    private var inboxHeader: some View {
        HStack(spacing: 8) {
            Text("Inbox")
                .sparkleLabelSm()
                .foregroundStyle(Color.dustForeground)

            Text("\(inboxConversations.count)")
                .sparkleLabelXs()
                .foregroundStyle(.white)
                .padding(.horizontal, 7)
                .padding(.vertical, 1)
                .background(Color.highlight, in: Capsule())

            Spacer()

            Button("Catch up", action: onCatchUp)
                .buttonStyle(.pill)
        }
        .padding(.horizontal, Self.horizontalPadding)
    }

    private func inboxCard(isFirst: Bool, isLast: Bool) -> some View {
        let radius = Self.inboxCornerRadius
        return UnevenRoundedRectangle(
            topLeadingRadius: isFirst ? radius : 0,
            bottomLeadingRadius: isLast ? radius : 0,
            bottomTrailingRadius: isLast ? radius : 0,
            topTrailingRadius: isFirst ? radius : 0
        )
        .fill(Color.dustBackground)
        .overlay {
            CardSegmentBorder(isFirst: isFirst, isLast: isLast, radius: radius)
                .stroke(Color.dustBorder, lineWidth: 1)
        }
        .padding(.horizontal, Self.inboxInset)
    }

    // MARK: - Pods

    private var visiblePods: [Space] {
        showsAllPods ? pods : Array(pods.prefix(Self.collapsedPodCount))
    }

    @ViewBuilder
    private var podsSection: some View {
        HStack {
            sectionTitle("Pods")
            Spacer()
            Menu {
                Button(action: onBrowsePods) {
                    Label("Browse and join pods", systemImage: "magnifyingglass")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.dustFaint)
                    .frame(width: 32, height: 28)
                    .contentShape(Rectangle())
            }
        }
        .padding(.leading, Self.horizontalPadding)
        .padding(.trailing, 8)
        .padding(.top, 20)
        .padding(.bottom, 2)
        .plainRow()

        ForEach(visiblePods) { pod in
            Button {
                onSelectPod(pod)
            } label: {
                HStack(spacing: 10) {
                    PodIcon(isRestricted: pod.isRestricted)
                    Text(pod.name)
                        .sparkleCopySm()
                        .foregroundStyle(Color.dustForeground)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, Self.horizontalPadding)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .plainRow()
        }

        if pods.count > Self.collapsedPodCount {
            Button {
                withAnimation(.snappy(duration: 0.25)) { showsAllPods.toggle() }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .rotationEffect(.degrees(showsAllPods ? 180 : 0))
                        .frame(width: 16)
                    Text(showsAllPods ? "Show less" : "Show all")
                        .sparkleCopySm()
                    Spacer()
                }
                .foregroundStyle(Color.dustFaint)
                .padding(.horizontal, Self.horizontalPadding)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .plainRow()
        }
    }

    // MARK: - Conversations

    @ViewBuilder
    private var conversationsSection: some View {
        if !groupedConversations.isEmpty {
            sectionTitle("Conversations")
                .padding(.horizontal, Self.horizontalPadding)
                .padding(.top, 20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .plainRow()
        }

        ForEach(groupedConversations, id: \.0) { group, conversations in
            Text(group)
                .sparkleLabelXs()
                .textCase(.uppercase)
                .foregroundStyle(Color.dustFaint)
                .padding(.horizontal, Self.horizontalPadding)
                .padding(.top, 12)
                .padding(.bottom, 2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .plainRow()

            ForEach(conversations) { conversation in
                conversationRow(conversation)
                    .plainRow()
            }
        }

        if hasMoreConversations {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .plainRow()
                .task(id: loadedConversationCount) { await onLoadMoreConversations() }
        }
    }

    private var loadedConversationCount: Int {
        inboxConversations.count + groupedConversations.reduce(0) { $0 + $1.1.count }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .sparkleLabelSm()
            .foregroundStyle(Color.dustFaint)
    }

    private func conversationRow(_ conversation: Conversation) -> some View {
        Button {
            onSelectConversation(conversation)
        } label: {
            ConversationRowView(conversation: conversation)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            Button {
                onToggleReadStatus(conversation)
            } label: {
                if conversation.unread || conversation.actionRequired {
                    SparkleIcon.eye.image
                } else {
                    SparkleIcon.inbox01.image
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
                SparkleIcon.trash01.image
            }
            .accessibilityLabel("Delete")
        }
    }
}

private struct CardSegmentBorder: Shape {
    let isFirst: Bool
    let isLast: Bool
    let radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let left = rect.minX + 0.5
        let right = rect.maxX - 0.5
        let top = rect.minY + 0.5
        let bottom = rect.maxY - 0.5
        var path = Path()
        if isFirst {
            path.move(to: CGPoint(x: left, y: rect.maxY))
            path.addArc(tangent1End: CGPoint(x: left, y: top), tangent2End: CGPoint(x: right, y: top), radius: radius)
            path.addArc(
                tangent1End: CGPoint(x: right, y: top),
                tangent2End: CGPoint(x: right, y: rect.maxY),
                radius: radius
            )
            path.addLine(to: CGPoint(x: right, y: rect.maxY))
        } else if isLast {
            path.move(to: CGPoint(x: left, y: rect.minY))
            path.addArc(
                tangent1End: CGPoint(x: left, y: bottom),
                tangent2End: CGPoint(x: right, y: bottom),
                radius: radius
            )
            path.addArc(
                tangent1End: CGPoint(x: right, y: bottom),
                tangent2End: CGPoint(x: right, y: rect.minY),
                radius: radius
            )
            path.addLine(to: CGPoint(x: right, y: rect.minY))
        } else {
            path.move(to: CGPoint(x: left, y: rect.minY))
            path.addLine(to: CGPoint(x: left, y: rect.maxY))
            path.move(to: CGPoint(x: right, y: rect.minY))
            path.addLine(to: CGPoint(x: right, y: rect.maxY))
        }
        return path
    }
}

private extension View {
    func plainRow(background: some View = Color.clear) -> some View {
        listRowInsets(EdgeInsets())
            .listRowBackground(background)
            .listRowSeparator(.hidden)
    }
}
