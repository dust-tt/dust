import SparkleTokens
import SwiftUI

struct AgentPickerSheet: View {
    let agents: [LightAgentConfiguration]
    let onSelect: (LightAgentConfiguration) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @FocusState private var isSearchFocused: Bool

    var body: some View {
        NavigationStack {
            List {
                ForEach(filteredAgents) { agent in
                    Button {
                        onSelect(agent)
                        dismiss()
                    } label: {
                        agentRow(agent)
                    }
                }
            }
            .listStyle(.plain)
            .navigationTitle("Select an agent")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func agentRow(_ agent: LightAgentConfiguration) -> some View {
        HStack(spacing: 12) {
            Avatar(url: agent.pictureUrl, size: 32)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(agent.name)
                        .sparkleLabelSm()
                        .foregroundStyle(Color.dustForeground)
                    if agent.userFavorite {
                        Image(systemName: "star.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(.yellow)
                    }
                }
                Text(agent.description)
                    .sparkleCopyXs()
                    .foregroundStyle(Color.dustFaint)
                    .lineLimit(1)
            }

            Spacer()
        }
        .contentShape(Rectangle())
    }

    private var filteredAgents: [LightAgentConfiguration] {
        guard !searchText.isEmpty else { return agents }
        let query = searchText.lowercased()
        return agents.filter {
            $0.name.lowercased().contains(query) || $0.description.lowercased().contains(query)
        }
    }
}
