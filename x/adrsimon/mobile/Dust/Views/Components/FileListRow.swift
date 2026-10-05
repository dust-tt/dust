import SparkleTokens
import SwiftUI

struct FileListRow: View {
    let systemImage: String
    let title: String
    let subtitle: String?
    let isHighlighted: Bool
    let showsChevron: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 18))
                    .foregroundStyle(isHighlighted ? Color.highlight : Color.dustFaint)
                    .frame(width: 28, height: 28)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .sparkleCopySm()
                        .foregroundStyle(Color.dustForeground)
                        .lineLimit(1)

                    if let subtitle {
                        Text(subtitle)
                            .sparkleCopyXs()
                            .foregroundStyle(Color.dustFaint)
                    }
                }

                Spacer()

                if showsChevron {
                    SparkleIcon.chevronRight.image
                        .resizable()
                        .frame(width: 12, height: 12)
                        .foregroundStyle(Color.dustFaint)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct FileListSectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .sparkleLabelXs()
            .foregroundStyle(Color.dustFaint)
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 4)
    }
}
