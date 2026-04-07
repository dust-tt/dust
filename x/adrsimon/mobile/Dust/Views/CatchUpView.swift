import SparkleTokens
import SwiftUI

struct CatchUpView: View {
    @StateObject private var viewModel: CatchUpViewModel
    @State private var dragOffset: CGFloat = 0
    @State private var isAnimatingOut = false
    @State private var dragDirection: DragDirection = .undecided

    private enum DragDirection {
        case undecided, horizontal, vertical
    }

    let currentUserEmail: String
    let onDismiss: (Set<String>) -> Void

    private static let swipeHintStart: CGFloat = 30
    private static let swipeCommitThreshold: CGFloat = 80
    private static let animationDuration: Double = 0.25

    init(
        conversations: [Conversation],
        workspaceId: String,
        tokenProvider: TokenProvider,
        currentUserEmail: String,
        onDismiss: @escaping (Set<String>) -> Void
    ) {
        _viewModel = StateObject(
            wrappedValue: CatchUpViewModel(
                conversations: conversations,
                workspaceId: workspaceId,
                tokenProvider: tokenProvider
            )
        )
        self.currentUserEmail = currentUserEmail
        self.onDismiss = onDismiss
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            ZStack {
                doneView
                    .opacity(viewModel.isDone ? 1 : 0)

                if !viewModel.isDone {
                    conversationCard
                }
            }
            .frame(maxHeight: .infinity)

            if !viewModel.isDone {
                actionButtons
            }
        }
        .background(Color.dustBackground)
        .task {
            await viewModel.loadCurrentMessages()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text(viewModel.progressText)
                .sparkleCopySm()
                .foregroundStyle(Color.dustFaint)

            Spacer()

            Button {
                let ids = viewModel.markedAsReadIds
                onDismiss(ids)
                Task { await viewModel.flush() }
            } label: {
                SparkleIcon.xMark.image
                    .resizable()
                    .frame(width: 16, height: 16)
                    .foregroundStyle(Color.dustForeground)
                    .padding(8)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Card

    private var conversationCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Card header
            HStack(spacing: 8) {
                Circle()
                    .fill(viewModel.currentConversation?.actionRequired == true
                        ? Color.golden400 : Color.highlight500)
                    .frame(width: 8, height: 8)

                Text(viewModel.currentConversation?.title ?? "New conversation")
                    .sparkleLabelSm()
                    .foregroundStyle(Color.dustForeground)
                    .lineLimit(1)
                    .truncationMode(.tail)

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider().foregroundStyle(Color.dustBorder)

            // Messages
            ScrollView {
                if viewModel.isLoadingMessages, viewModel.messages.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 32)
                } else if viewModel.messages.isEmpty {
                    Text("No messages")
                        .sparkleCopyXs()
                        .foregroundStyle(Color.dustFaint)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 32)
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(viewModel.messages) { message in
                            MessageBubbleView(
                                message: message,
                                currentUserEmail: currentUserEmail
                            )
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }
            }
            .defaultScrollAnchor(.bottom)
            .background(Color.dustBackground)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.dustMutedBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.dustBorder, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.08), radius: 8, y: 4)
        .overlay { swipeHint.allowsHitTesting(false) }
        .padding(.horizontal, 16)
        .offset(x: dragOffset)
        .rotationEffect(
            .degrees(Double(dragOffset) / 25),
            anchor: .bottom
        )
        .simultaneousGesture(swipeGesture)
        .allowsHitTesting(!isAnimatingOut)
    }

    // MARK: - Swipe

    private var swipeHint: some View {
        ZStack {
            if dragOffset > Self.swipeHintStart {
                let progress = min(Double(dragOffset - Self.swipeHintStart) / 60, 1)
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.highlight500.opacity(progress * 0.15))

                VStack(spacing: 4) {
                    SparkleIcon.check.image
                        .resizable()
                        .frame(width: 28, height: 28)
                    Text("Mark as read")
                        .sparkleLabelXs()
                }
                .foregroundStyle(Color.highlight500)
                .opacity(progress)
            }

            if dragOffset < -Self.swipeHintStart {
                let progress = min(Double(-dragOffset - Self.swipeHintStart) / 60, 1)
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.dustFaint.opacity(progress * 0.1))

                VStack(spacing: 4) {
                    SparkleIcon.clock.image
                        .resizable()
                        .frame(width: 28, height: 28)
                    Text("Keep for later")
                        .sparkleLabelXs()
                }
                .foregroundStyle(Color.dustFaint)
                .opacity(progress)
            }
        }
    }

    private var swipeGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                if dragDirection == .undecided {
                    let absWidth = abs(value.translation.width)
                    let absHeight = abs(value.translation.height)
                    if absWidth > 10 || absHeight > 10 {
                        dragDirection = absWidth > absHeight ? .horizontal : .vertical
                    }
                }
                if dragDirection == .horizontal {
                    dragOffset = value.translation.width
                }
            }
            .onEnded { value in
                defer { dragDirection = .undecided }
                guard dragDirection == .horizontal else { return }

                if value.translation.width > Self.swipeCommitThreshold {
                    animateOut(direction: 1) { viewModel.markAsRead() }
                } else if value.translation.width < -Self.swipeCommitThreshold {
                    animateOut(direction: -1) { viewModel.keepForLater() }
                } else {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        dragOffset = 0
                    }
                }
            }
    }

    private func animateOut(direction: CGFloat, then action: @escaping () -> Void) {
        guard !isAnimatingOut else { return }
        isAnimatingOut = true
        withAnimation(.easeInOut(duration: Self.animationDuration)) {
            dragOffset = direction * 400
        } completion: {
            dragOffset = 0
            isAnimatingOut = false
            action()
        }
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 12) {
            Button {
                animateOut(direction: -1) { viewModel.keepForLater() }
            } label: {
                HStack(spacing: 6) {
                    SparkleIcon.clock.image
                        .resizable()
                        .frame(width: 14, height: 14)
                    Text("Keep for later")
                        .sparkleLabelSm()
                }
                .foregroundStyle(Color.dustForeground)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.dustMutedBackground)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Button {
                animateOut(direction: 1) { viewModel.markAsRead() }
            } label: {
                HStack(spacing: 6) {
                    SparkleIcon.check.image
                        .resizable()
                        .frame(width: 14, height: 14)
                    Text("Mark as read")
                        .sparkleLabelSm()
                }
                .foregroundStyle(Color.dustBackground)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.highlight500)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .disabled(isAnimatingOut)
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 16)
    }

    // MARK: - Done

    private var doneView: some View {
        VStack(spacing: 12) {
            SparkleIcon.checkCircle.image
                .resizable()
                .frame(width: 48, height: 48)
                .foregroundStyle(Color.highlight500)

            Text("All caught up!")
                .sparkleCopySm()
                .foregroundStyle(Color.dustForeground)
        }
        .task(id: viewModel.isDone) {
            guard viewModel.isDone else { return }
            try? await Task.sleep(for: .seconds(1.5))
            onDismiss(viewModel.markedAsReadIds)
        }
        .onTapGesture {
            guard viewModel.isDone else { return }
            onDismiss(viewModel.markedAsReadIds)
        }
    }
}
