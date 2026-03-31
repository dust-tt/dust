import SparkleTokens
import SwiftUI

struct FrameVisualizerView: View {
    let frameToken: String

    @Environment(\.dismiss) private var dismiss
    @State private var isLoading = true
    @State private var pageTitle = ""

    private var frameURL: URL {
        URL(string: "\(AppConfig.appURL)/share/frame/\(frameToken)")!
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.dustBackground.ignoresSafeArea()

                FrameWebView(url: frameURL, isLoading: $isLoading, pageTitle: $pageTitle)
                    .ignoresSafeArea(edges: .bottom)

                if isLoading {
                    ProgressView()
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        SparkleIcon.xMark.image
                            .resizable()
                            .frame(width: 20, height: 20)
                            .foregroundStyle(Color.dustForeground)
                    }
                }

                ToolbarItem(placement: .principal) {
                    Text(pageTitle.isEmpty ? "Frame" : pageTitle)
                        .sparkleCopyBase()
                        .foregroundStyle(Color.dustForeground)
                        .lineLimit(1)
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    ShareLink(item: frameURL) {
                        SparkleIcon.arrowUpOnSquare.image
                            .resizable()
                            .frame(width: 20, height: 20)
                            .foregroundStyle(Color.dustForeground)
                    }
                }
            }
            .toolbarBackground(Color.dustBackground, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
    }
}
