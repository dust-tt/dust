import SparkleTokens
import SwiftUI

struct NewConversationView: View {
    let firstName: String?
    let user: User
    let workspaceId: String
    let tokenProvider: TokenProvider
    let onConversationCreated: (Conversation) -> Void

    @StateObject private var inputBarViewModel: InputBarViewModel

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
        VStack(spacing: 0) {
            VStack(spacing: 16) {
                Spacer()

                DustLogo.dustLogoSquare.image
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 48, height: 48)

                Text("Hey \(firstName ?? "there"), how can I help you today?")
                    .sparkleCopyXl()
                    .foregroundStyle(Color.dustForeground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            InputBarView(
                viewModel: inputBarViewModel,
                onConversationCreated: onConversationCreated
            )
        }
        .background(Color.dustBackground)
        .task {
            await inputBarViewModel.loadAgents()
        }
    }
}
