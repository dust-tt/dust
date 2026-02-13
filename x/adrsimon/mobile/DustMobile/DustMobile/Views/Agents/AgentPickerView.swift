import SwiftUI

struct AgentPickerView: View {
    var viewModel: AgentPickerViewModel
    let onSelect: (LightAgentConfigurationType) -> Void

    @Environment(\.dismiss) var dismiss
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            List {
                if !viewModel.favoriteAgents.isEmpty {
                    Section("Favorites") {
                        ForEach(filteredFavorites) { agent in
                            AgentPickerRow(agent: agent) {
                                onSelect(agent)
                                dismiss()
                            }
                        }
                    }
                }

                Section("All Agents") {
                    ForEach(filteredAgents) { agent in
                        AgentPickerRow(agent: agent) {
                            onSelect(agent)
                            dismiss()
                        }
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search agents...")
            .navigationTitle("Select Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .overlay {
                if viewModel.isLoading && viewModel.agents.isEmpty {
                    ProgressView("Loading agents...")
                }
            }
        }
        .task {
            if viewModel.agents.isEmpty {
                await viewModel.loadAgents()
            }
        }
    }

    private var filteredFavorites: [LightAgentConfigurationType] {
        if searchText.isEmpty { return viewModel.favoriteAgents }
        return viewModel.favoriteAgents.filter { matches($0) }
    }

    private var filteredAgents: [LightAgentConfigurationType] {
        let agents = viewModel.activeAgents
        if searchText.isEmpty { return agents }
        return agents.filter { matches($0) }
    }

    private func matches(_ agent: LightAgentConfigurationType) -> Bool {
        let query = searchText.lowercased()
        return agent.name.lowercased().contains(query) ||
               agent.description.lowercased().contains(query)
    }
}

struct AgentPickerRow: View {
    let agent: LightAgentConfigurationType
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 12) {
                AsyncImage(url: URL(string: agent.pictureUrl)) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Circle()
                        .fill(Color.purple.opacity(0.2))
                        .overlay(
                            Text(String(agent.name.prefix(1)).uppercased())
                                .font(.caption.bold())
                                .foregroundStyle(.purple)
                        )
                }
                .frame(width: 36, height: 36)
                .clipShape(Circle())

                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(agent.name)
                            .font(.subheadline.bold())
                            .foregroundStyle(.primary)
                        if agent.userFavorite {
                            Image(systemName: "star.fill")
                                .font(.caption2)
                                .foregroundStyle(.yellow)
                        }
                    }
                    Text(agent.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer()
            }
        }
    }
}
