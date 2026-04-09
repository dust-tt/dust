import SparkleTokens
import SwiftUI

struct ConversationListBottomBar: View {
    @Binding var searchText: String
    let onNewConversation: () -> Void

    var body: some View {
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
