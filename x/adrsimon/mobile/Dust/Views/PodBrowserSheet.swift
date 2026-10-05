import SparkleTokens
import SwiftUI

struct PodBrowserSheet: View {
    let onOpen: (Space) -> Void
    let onJoined: (Space) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: PodBrowserViewModel

    init(
        workspaceId: String,
        tokenProvider: TokenProvider,
        onOpen: @escaping (Space) -> Void,
        onJoined: @escaping (Space) -> Void
    ) {
        self.onOpen = onOpen
        self.onJoined = onJoined
        _viewModel = StateObject(wrappedValue: PodBrowserViewModel(
            workspaceId: workspaceId,
            tokenProvider: tokenProvider
        ))
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.pods.isEmpty, viewModel.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if viewModel.pods.isEmpty {
                    ContentUnavailableView.search(text: viewModel.searchText)
                } else {
                    List(viewModel.pods) { pod in
                        podRow(pod)
                            .task { await viewModel.loadMoreIfNeeded(after: pod) }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Pods")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(
                text: $viewModel.searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search pods"
            )
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await viewModel.load() }
            .onChange(of: viewModel.searchText) {
                viewModel.debounceSearch()
            }
        }
    }

    private func podRow(_ pod: Space) -> some View {
        HStack(spacing: 10) {
            Button {
                onOpen(pod)
                dismiss()
            } label: {
                HStack(spacing: 10) {
                    PodIcon(isRestricted: pod.isRestricted)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(pod.name)
                            .sparkleLabelSm()
                            .foregroundStyle(Color.dustForeground)
                            .lineLimit(1)
                        if let description = pod.description, !description.isEmpty {
                            Text(description)
                                .sparkleCopyXs()
                                .foregroundStyle(Color.dustFaint)
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            joinControl(pod)
        }
    }

    @ViewBuilder
    private func joinControl(_ pod: Space) -> some View {
        if pod.isMember {
            Text("Joined")
                .sparkleCopyXs()
                .foregroundStyle(Color.dustFaint)
        } else if viewModel.joiningPodIds.contains(pod.sId) {
            ProgressView()
        } else if !pod.isRestricted {
            Button("Join") {
                Task {
                    if await viewModel.join(pod) {
                        onJoined(pod)
                        onOpen(pod)
                        dismiss()
                    }
                }
            }
            .buttonStyle(.pill)
        }
    }
}

struct PodIcon: View {
    let isRestricted: Bool

    var body: some View {
        (isRestricted ? SparkleIcon.cubeOutline : SparkleIcon.cube01).image
            .resizable()
            .frame(width: 16, height: 16)
            .foregroundStyle(Color.dustFaint)
    }
}
