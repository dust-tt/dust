import SparkleTokens
import SwiftUI

struct AttachmentViewerView: View {
    let title: String
    let contentType: String
    let fileId: String
    let workspaceId: String
    let tokenProvider: TokenProvider
    let sourceUrl: String?

    @Environment(\.dismiss) private var dismiss
    @State private var fileData: Data?
    @State private var isLoading = true
    @State private var errorMessage: String?

    // For frame rendering
    @State private var frameIsLoading = true
    @State private var framePageTitle = ""

    private var isFrame: Bool {
        Attachment.isFrame(contentType)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.dustBackground.ignoresSafeArea()

                if isLoading {
                    ProgressView()
                } else if let errorMessage {
                    errorView(errorMessage)
                } else if let fileData {
                    contentView(fileData)
                }
            }
            .ignoresSafeArea(edges: .bottom)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { dismiss() } label: {
                        SparkleIcon.xMark.image
                            .resizable()
                            .frame(width: 20, height: 20)
                            .foregroundStyle(Color.dustForeground)
                    }
                }

                ToolbarItem(placement: .principal) {
                    Text(isFrame ? (framePageTitle.isEmpty ? title : framePageTitle) : title)
                        .sparkleCopyBase()
                        .foregroundStyle(Color.dustForeground)
                        .lineLimit(1)
                }
            }
        }
        .task {
            await loadFileData()
        }
    }

    // MARK: - Content Routing

    @ViewBuilder
    private func contentView(_ data: Data) -> some View {
        if isFrame, let code = String(data: data, encoding: .utf8) {
            frameView(code: code)
        } else if contentType.hasPrefix("image/"), let uiImage = UIImage(data: data) {
            ZoomableImageView(image: uiImage)
        } else if contentType.contains("pdf") {
            PDFKitView(data: data)
        } else if let text = String(data: data, encoding: .utf8) {
            ScrollView {
                Text(text)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(Color.dustForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
        } else {
            otherFileView
        }
    }

    // MARK: - Frame Rendering

    /// Renders a frame by embedding the viz service iframe in a wrapper HTML
    /// that handles the postMessage RPC protocol.
    private func frameView(code: String) -> some View {
        ZStack {
            FrameWebView(
                htmlString: buildFrameWrapperHTML(code: code),
                baseURL: URL(string: AppConfig.appURL),
                isLoading: $frameIsLoading,
                pageTitle: $framePageTitle
            )
            if frameIsLoading {
                ProgressView()
            }
        }
    }

    private func buildFrameWrapperHTML(code: String) -> String {
        let escapedCode = code
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "`", with: "\\`")
            .replacingOccurrences(of: "$", with: "\\$")
            .replacingOccurrences(of: "</", with: "<\\/")

        let vizIdentifier = "viz-\(fileId)"
        let vizURL = "\(AppConfig.vizURL)/content?identifier=\(vizIdentifier)&fullHeight=true"

        return """
        <!DOCTYPE html>
        <html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
        <style>
        * { margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
        iframe { width: 100%; height: 100%; border: none; }
        </style>
        </head><body>
        <iframe id="viz" src="\(vizURL)"
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"></iframe>
        <script>
        const FRAME_CODE = `\(escapedCode)`;
        const IDENTIFIER = '\(vizIdentifier)';

        window.addEventListener('message', function(event) {
          const data = event.data;
          if (!data || !data.command || data.identifier !== IDENTIFIER) return;

          if (data.command === 'getCodeToExecute') {
            event.source.postMessage({
              command: 'answer',
              messageUniqueId: data.messageUniqueId,
              identifier: IDENTIFIER,
              result: { code: FRAME_CODE }
            }, '*');
          }
          else if (data.command === 'getFile') {
            window.webkit.messageHandlers.fileRequest.postMessage({
              messageUniqueId: data.messageUniqueId,
              fileId: data.params.fileId
            });
          }
          else if (data.command === 'setErrorMessage') {
            if (data.params && data.params.errorMessage) {
              window.webkit.messageHandlers.frameError.postMessage(data.params.errorMessage);
            }
          }
        });
        </script>
        </body></html>
        """
    }

    private var otherFileView: some View {
        VStack(spacing: 16) {
            Image(systemName: Attachment.sfSymbol(for: contentType))
                .font(.system(size: 48))
                .foregroundStyle(Color.dustFaint)

            Text(title)
                .sparkleCopyBase()
                .foregroundStyle(Color.dustForeground)

            Text(contentType)
                .sparkleCopyXs()
                .foregroundStyle(Color.dustFaint)

            if let sourceUrl, let url = URL(string: sourceUrl) {
                Link("Open in Safari", destination: url)
                    .sparkleCopySm()
            }
        }
        .padding()
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 32))
                .foregroundStyle(Color.dustFaint)

            Text(message)
                .sparkleCopySm()
                .foregroundStyle(Color.dustFaint)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button("Retry") {
                Task { await loadFileData() }
            }
        }
    }

    // MARK: - Data Loading

    private func loadFileData() async {
        isLoading = true
        errorMessage = nil
        do {
            fileData = try await FileContentService.fetchFileData(
                workspaceId: workspaceId,
                fileId: fileId,
                tokenProvider: tokenProvider
            )
            isLoading = false
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }
}
