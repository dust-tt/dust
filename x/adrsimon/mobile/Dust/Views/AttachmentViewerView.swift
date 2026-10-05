import SparkleTokens
import SwiftUI

struct AttachmentViewerView: View {
    let title: String
    let contentType: String
    let file: FileReference
    let workspaceId: String
    let tokenProvider: TokenProvider
    let sourceUrl: String?

    @State private var frameHost: FrameHostBridge
    @Environment(\.dismiss) private var dismiss
    @State private var fileData: Data?
    @State private var isLoading = true
    @State private var errorMessage: String?

    // For frame rendering
    @State private var frameIsLoading = true
    @State private var framePageTitle = ""

    init(
        title: String,
        contentType: String,
        file: FileReference,
        workspaceId: String,
        tokenProvider: TokenProvider,
        sourceUrl: String?
    ) {
        self.title = title
        self.contentType = contentType
        self.file = file
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
        self.sourceUrl = sourceUrl
        _frameHost = State(initialValue: FrameHostBridge(
            workspaceId: workspaceId,
            file: file,
            contentType: contentType,
            tokenProvider: tokenProvider
        ))
    }

    private var isFrame: Bool {
        Attachment.isFrame(contentType)
    }

    private var vizFileKey: String {
        switch file {
        case let .id(fileId): fileId
        case let .path(path): path
        }
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
                        SparkleIcon.xClose.image
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
                messageHandlers: [FrameHostBridge.handlerName: frameHost],
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

        let vizIdentifier = "viz-\(vizFileKey)"
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
        const READ_ONLY_MESSAGE = 'Frames are read-only in the Dust iOS app.';
        const FUNCTIONS_UNSUPPORTED_MESSAGE = 'Frame functions are not available in the Dust iOS app yet.';
        const host = window.webkit.messageHandlers.\(FrameHostBridge.handlerName);

        async function askHost(request) {
          const reply = await host.postMessage(JSON.stringify(request));
          return reply ? JSON.parse(reply) : null;
        }

        function blobFromPayload(payload) {
          if (!payload || payload.base64 === null) return null;
          const binary = atob(payload.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return new Blob([bytes], { type: payload.contentType || '' });
        }

        window.addEventListener('message', async function(event) {
          const data = event.data;
          if (!data || !data.command || data.identifier !== IDENTIFIER) return;

          const reply = function(body) {
            event.source.postMessage(
              Object.assign(
                { command: 'answer', messageUniqueId: data.messageUniqueId, identifier: IDENTIFIER },
                body
              ),
              '*'
            );
          };

          switch (data.command) {
            case 'getCodeToExecute':
              reply({ result: { code: FRAME_CODE } });
              break;
            case 'getFile':
              try {
                const payload = await askHost({ command: 'getFile', fileId: data.params.fileId });
                reply({ result: { fileBlob: blobFromPayload(payload) } });
              } catch (error) {
                reply({ result: { fileBlob: null } });
              }
              break;
            case 'getUserIdentity':
              try {
                reply({ result: await askHost({ command: 'getUserIdentity' }) });
              } catch (error) {
                reply({ error: { message: String(error) } });
              }
              break;
            case 'writeFile':
              reply({ result: { success: false, error: { code: 'read_only', message: READ_ONLY_MESSAGE } } });
              break;
            case 'editText':
              reply({ result: { success: false, error: READ_ONLY_MESSAGE } });
              break;
            case 'callFunction':
              reply({ error: { code: 'not_supported', message: FUNCTIONS_UNSUPPORTED_MESSAGE } });
              break;
            case 'setErrorMessage':
              askHost({ command: 'setErrorMessage', errorMessage: data.params && data.params.errorMessage });
              break;
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
                file: file,
                tokenProvider: tokenProvider
            )
            isLoading = false
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }
}
