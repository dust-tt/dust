import os
import SparkleTokens
import SwiftUI

struct KnowledgePickerSheet: View {
    let workspaceId: String
    let tokenProvider: TokenProvider
    let selectedItems: [KnowledgeItem]
    let onSelect: (KnowledgeItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var searchVM = KnowledgeSearchViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if searchVM.searchText.count < 2 {
                    promptView
                } else if searchVM.isLoading && searchVM.results.isEmpty {
                    loadingView
                } else if searchVM.results.isEmpty {
                    noResultsView
                } else {
                    resultsList
                }
            }
            .navigationTitle("Knowledge")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(
                text: $searchVM.searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search documents..."
            )
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onChange(of: searchVM.searchText) { _, newValue in
                searchVM.debounceSearch(
                    query: newValue,
                    workspaceId: workspaceId,
                    tokenProvider: tokenProvider
                )
            }
        }
    }

    // MARK: - States

    private var promptView: some View {
        VStack(spacing: 12) {
            Spacer()
            SparkleIcon.actionMagnifyingGlass.image
                .resizable()
                .frame(width: 28, height: 28)
                .foregroundStyle(Color.dustFaint)
            Text("Search for documents and tables")
                .sparkleCopySm()
                .foregroundStyle(Color.dustFaint)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView()
                .progressViewStyle(.circular)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var noResultsView: some View {
        VStack(spacing: 12) {
            Spacer()
            SparkleIcon.documentText.image
                .resizable()
                .frame(width: 28, height: 28)
                .foregroundStyle(Color.dustFaint)
            Text("No results found")
                .sparkleCopySm()
                .foregroundStyle(Color.dustFaint)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Results

    private var resultsList: some View {
        List {
            ForEach(filteredResults) { node in
                Button {
                    if let item = node.toKnowledgeItem() {
                        onSelect(item)
                        dismiss()
                    }
                } label: {
                    nodeRow(node)
                }
            }

            if searchVM.isLoading {
                HStack {
                    Spacer()
                    ProgressView().scaleEffect(0.8)
                    Spacer()
                }
            }
        }
        .listStyle(.plain)
    }

    private func nodeRow(_ node: SearchNode) -> some View {
        HStack(spacing: 12) {
            dataSourceIcon(for: node)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 16, height: 16)
                .foregroundStyle(Color.dustForeground)
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(node.title)
                    .sparkleLabelSm()
                    .foregroundStyle(Color.dustForeground)
                    .lineLimit(1)

                if let subtitle = nodeSubtitle(node) {
                    Text(subtitle)
                        .sparkleCopyXs()
                        .foregroundStyle(Color.dustFaint)
                        .lineLimit(1)
                }
            }

            Spacer()
        }
        .contentShape(Rectangle())
    }

    // MARK: - Helpers

    private var filteredResults: [SearchNode] {
        let selectedIds = Set(selectedItems.map(\.id))
        return searchVM.results.filter { node in
            guard let item = node.toKnowledgeItem() else { return true }
            return !selectedIds.contains(item.id)
        }
    }

    private func dataSourceIcon(for node: SearchNode) -> Image {
        if let provider = node.dataSource?.connectorProvider,
           let icon = MCPServerIcon.icon(for: provider)
        {
            return icon.image
        }
        return node.type == "table"
            ? SparkleIcon.actionTable.image
            : SparkleIcon.documentText.image
    }

    private func nodeSubtitle(_ node: SearchNode) -> String? {
        let parts = [node.parentTitle, node.dataSource?.connectorProvider ?? node.dataSource?.name].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

// MARK: - Search ViewModel

private let logger = Logger(subsystem: AppConfig.bundleId, category: "KnowledgeSearch")

@MainActor
private final class KnowledgeSearchViewModel: ObservableObject {
    @Published var searchText = ""
    @Published var results: [SearchNode] = []
    @Published var isLoading = false

    private var searchTask: Task<Void, Never>?

    func debounceSearch(
        query: String,
        workspaceId: String,
        tokenProvider: TokenProvider
    ) {
        searchTask?.cancel()

        guard query.count >= 2 else {
            results = []
            isLoading = false
            return
        }

        isLoading = true

        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }

            do {
                let response = try await CapabilityService.searchKnowledge(
                    workspaceId: workspaceId,
                    query: query,
                    tokenProvider: tokenProvider
                )
                guard !Task.isCancelled else { return }
                results = response.nodes
            } catch {
                guard !Task.isCancelled else { return }
                logger.error("Knowledge search failed: \(error)")
            }
            isLoading = false
        }
    }
}
