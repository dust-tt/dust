import SparkleTokens
import SwiftUI

struct CapabilitiesPickerSheet: View {
    let capabilities: [Capability]
    let selectedCapabilities: [Capability]
    let onSelect: (Capability) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            Group {
                if filteredCapabilities.isEmpty {
                    VStack {
                        Spacer()
                        Text(searchText.isEmpty ? "No capabilities available" : "No results")
                            .sparkleCopySm()
                            .foregroundStyle(Color.dustFaint)
                        Spacer()
                    }
                } else {
                    List {
                        ForEach(filteredCapabilities) { capability in
                            Button {
                                onSelect(capability)
                                dismiss()
                            } label: {
                                capabilityRow(capability)
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Capabilities")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func capabilityRow(_ capability: Capability) -> some View {
        HStack(spacing: 12) {
            capabilityIcon(capability)

            VStack(alignment: .leading, spacing: 2) {
                Text(capability.displayName)
                    .sparkleLabelSm()
                    .foregroundStyle(Color.dustForeground)
                Text(capability.displayDescription)
                    .sparkleCopyXs()
                    .foregroundStyle(Color.dustFaint)
                    .lineLimit(1)
            }

            Spacer()
        }
        .contentShape(Rectangle())
    }

    private var filteredCapabilities: [Capability] {
        let selectedIds = Set(selectedCapabilities.map(\.id))
        let unselected = capabilities.filter { !selectedIds.contains($0.id) }

        guard !searchText.isEmpty else { return unselected }
        let query = searchText.lowercased()
        return unselected.filter {
            $0.displayName.lowercased().contains(query) ||
                $0.displayDescription.lowercased().contains(query)
        }
    }

    @ViewBuilder
    private func capabilityIcon(_ capability: Capability) -> some View {
        capability.icon.image
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(width: 16, height: 16)
            .foregroundStyle(capability.isSkill ? Color.highlight : Color.dustForeground)
            .frame(width: 32, height: 32)
            .background(capability.isSkill ? Color.highlight.opacity(0.12) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
