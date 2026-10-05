import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "PodBrowser")

@MainActor
final class PodBrowserViewModel: ObservableObject {
    private static let pageSize = 50
    private static let searchDebounce: Duration = .milliseconds(300)

    @Published private(set) var pods: [Space] = []
    @Published private(set) var isLoading = true
    @Published private(set) var hasMore = false
    @Published private(set) var joiningPodIds: Set<String> = []
    @Published var searchText = ""

    private let workspaceId: String
    private let tokenProvider: TokenProvider
    private var lastValue: String?
    private var searchTask: Task<Void, Never>?
    private var isLoadingMore = false

    init(workspaceId: String, tokenProvider: TokenProvider) {
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
    }

    func load() async {
        await loadFirstPage(query: searchText)
    }

    func debounceSearch() {
        searchTask?.cancel()
        let query = searchText
        searchTask = Task {
            try? await Task.sleep(for: Self.searchDebounce)
            guard !Task.isCancelled else { return }
            await loadFirstPage(query: query)
        }
    }

    func loadMoreIfNeeded(after pod: Space) async {
        guard pod.sId == pods.last?.sId, hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        let query = searchText
        do {
            let page = try await fetchPage(query: query, lastValue: lastValue)
            guard query == searchText else { return }
            pods.append(contentsOf: page.spaces)
            apply(page)
        } catch {
            logger.error("Failed to load more pods: \(error)")
        }
    }

    func join(_ pod: Space) async -> Bool {
        joiningPodIds.insert(pod.sId)
        defer { joiningPodIds.remove(pod.sId) }
        do {
            try await SpaceService.joinPod(workspaceId: workspaceId, spaceId: pod.sId, tokenProvider: tokenProvider)
            return true
        } catch {
            logger.error("Failed to join pod \(pod.sId): \(error)")
            return false
        }
    }

    private func loadFirstPage(query: String) async {
        isLoading = true
        do {
            let page = try await fetchPage(query: query, lastValue: nil)
            guard !Task.isCancelled, query == searchText else { return }
            pods = page.spaces
            apply(page)
        } catch {
            logger.error("Failed to search pods: \(error)")
        }
        isLoading = false
    }

    private func fetchPage(query: String, lastValue: String?) async throws -> SearchPodsResponse {
        try await SpaceService.searchPods(
            workspaceId: workspaceId,
            query: query,
            lastValue: lastValue,
            limit: Self.pageSize,
            tokenProvider: tokenProvider
        )
    }

    private func apply(_ page: SearchPodsResponse) {
        hasMore = page.hasMore
        lastValue = page.lastValue
    }
}
