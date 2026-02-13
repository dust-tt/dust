import Foundation

@MainActor
@Observable
class AgentPickerViewModel {
    var agents: [LightAgentConfigurationType] = []
    var isLoading = false
    var error: String?
    var searchText = ""

    @ObservationIgnored private let appState: AppState

    init(appState: AppState) {
        self.appState = appState
    }

    var filteredAgents: [LightAgentConfigurationType] {
        if searchText.isEmpty {
            return agents
        }
        let query = searchText.lowercased()
        return agents.filter {
            $0.name.lowercased().contains(query) ||
            $0.description.lowercased().contains(query)
        }
    }

    var favoriteAgents: [LightAgentConfigurationType] {
        agents.filter { $0.userFavorite }
    }

    var activeAgents: [LightAgentConfigurationType] {
        agents.filter { $0.status == "active" }
    }

    func loadAgents() async {
        guard let workspaceId = appState.workspaceId else { return }

        isLoading = true
        error = nil

        do {
            agents = try await appState.apiClient.getAgentConfigurations(
                domain: appState.domain,
                workspaceId: workspaceId
            )
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func refresh() async {
        await loadAgents()
    }
}
