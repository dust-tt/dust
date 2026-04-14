import SparkleTokens
import SwiftUI

struct RemovableChipView: View {
    let icon: SparkleIcon
    let iconColor: Color
    let text: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            icon.image
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 10, height: 10)
                .foregroundStyle(iconColor)

            Text(text)
                .sparkleCopyXs()
                .foregroundStyle(Color.dustForeground)
                .lineLimit(1)

            Button {
                onRemove()
            } label: {
                SparkleIcon.xMark.image
                    .resizable()
                    .frame(width: 8, height: 8)
                    .foregroundStyle(Color.dustFaint)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.dustFaint.opacity(0.12))
        .clipShape(Capsule())
    }
}
