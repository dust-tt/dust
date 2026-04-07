import SparkleTokens
import SwiftUI

private enum EasterEggPhase: Equatable {
    case idle
    case dismantling
    case playing
}

struct NewConversationView: View {
    let firstName: String?
    let user: User
    let workspaceId: String
    let tokenProvider: TokenProvider
    let onConversationCreated: (Conversation) -> Void

    @StateObject private var inputBarViewModel: InputBarViewModel

    @State private var tapCount = 0
    @State private var lastTapTime: Date = .distantPast
    @State private var easterEggPhase: EasterEggPhase = .idle

    // Logo piece animation state
    @State private var pieceOffsets: [CGSize] = Array(repeating: .zero, count: DustLogoPiecesView.pieceCount)
    @State private var pieceRotations: [Double] = Array(repeating: 0, count: DustLogoPiecesView.pieceCount)
    @State private var pieceOpacity: Double = 1
    @State private var uiOpacity: Double = 1
    @State private var animationTask: Task<Void, Never>?

    init(
        firstName: String?,
        user: User,
        workspaceId: String,
        tokenProvider: TokenProvider,
        onConversationCreated: @escaping (Conversation) -> Void
    ) {
        self.firstName = firstName
        self.user = user
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
        self.onConversationCreated = onConversationCreated
        _inputBarViewModel = StateObject(
            wrappedValue: InputBarViewModel(
                workspaceId: workspaceId,
                tokenProvider: tokenProvider,
                user: user
            )
        )
    }

    var body: some View {
        ZStack {
            // Normal conversation UI
            VStack(spacing: 0) {
                VStack(spacing: 16) {
                    Spacer()

                    ZStack {
                        // Original logo (visible only when idle)
                        DustLogo.dustLogoSquare.image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 48, height: 48)
                            .opacity(easterEggPhase == .idle ? 1 : 0)

                        // Animated logo pieces (visible during dismantle)
                        if easterEggPhase == .dismantling {
                            DustLogoPiecesView(
                                pieceOffsets: pieceOffsets,
                                pieceRotations: pieceRotations,
                                pieceOpacity: pieceOpacity
                            )
                            .frame(width: 48, height: 48)
                        }
                    }
                    .onTapGesture {
                        handleLogoTap()
                    }

                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                InputBarView(
                    viewModel: inputBarViewModel,
                    onConversationCreated: onConversationCreated
                )
                .opacity(uiOpacity)
            }

            // Snake game overlay
            if easterEggPhase == .playing {
                SnakeGameView(onDismiss: {
                    dismissEasterEgg()
                })
                .transition(.opacity)
            }
        }
        .background(Color.dustBackground)
        .task {
            await inputBarViewModel.loadAgents()
        }
        .onDisappear {
            inputBarViewModel.cancelUploads()
            animationTask?.cancel()
        }
    }

    // MARK: - Easter Egg Logic

    private func handleLogoTap() {
        guard easterEggPhase == .idle else { return }

        let now = Date()
        if now.timeIntervalSince(lastTapTime) > 0.8 {
            tapCount = 0
        }
        tapCount += 1
        lastTapTime = now

        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        if tapCount >= 5 {
            tapCount = 0
            startEasterEgg()
        }
    }

    private func startEasterEgg() {
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()

        // Reset piece state to assembled
        let count = DustLogoPiecesView.pieceCount
        pieceOffsets = Array(repeating: .zero, count: count)
        pieceRotations = Array(repeating: 0, count: count)
        pieceOpacity = 1
        uiOpacity = 1

        easterEggPhase = .dismantling

        // Phase 1: Dismantle - pieces fly apart
        withAnimation(.easeOut(duration: 0.8)) {
            for index in 0 ..< count {
                let angle = Double.random(in: 0 ... (2 * .pi))
                let distance = Double.random(in: 100 ... 200)
                pieceOffsets[index] = CGSize(
                    width: cos(angle) * distance,
                    height: sin(angle) * distance
                )
                pieceRotations[index] = Double.random(in: -60 ... 60)
            }
            uiOpacity = 0
        }

        animationTask = Task { @MainActor in
            // Phase 2: Fade out pieces
            try? await Task.sleep(for: .milliseconds(900))
            guard !Task.isCancelled else { return }
            withAnimation(.easeIn(duration: 0.4)) {
                pieceOpacity = 0
            }

            // Phase 3: Show game
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.3)) {
                easterEggPhase = .playing
            }
        }
    }

    private func dismissEasterEgg() {
        animationTask?.cancel()
        withAnimation(.easeInOut(duration: 0.3)) {
            easterEggPhase = .idle
            uiOpacity = 1
        }
    }
}
