import SwiftUI

struct InputBarView: View {
    @Bindable var viewModel: InputBarViewModel
    var agentPickerVM: AgentPickerViewModel?
    let onSend: () async -> Void

    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Attachments preview
            if !viewModel.attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(viewModel.attachments.uploaded.enumerated()), id: \.element.fileId) { index, attachment in
                            AttachmentChip(title: attachment.title, icon: "doc.fill") {
                                viewModel.removeAttachment(at: index)
                            }
                        }
                        ForEach(Array(viewModel.attachments.contentNodes.enumerated()), id: \.element.internalId) { index, node in
                            AttachmentChip(title: node.title, icon: "folder.fill") {
                                viewModel.removeContentNode(at: index)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                }
            }

            // Mention tokens
            if !viewModel.mentions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(viewModel.mentions, id: \.configurationId) { mention in
                            MentionTokenView(
                                name: viewModel.mentionNames[mention.configurationId] ?? "Agent",
                                onRemove: {
                                    viewModel.removeMention(configurationId: mention.configurationId)
                                }
                            )
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 6)
                }
            }

            // Input row
            HStack(alignment: .bottom, spacing: 8) {
                // Attachment button
                Button {
                    viewModel.showAttachmentPicker = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                // Text field
                TextField("Message @agent...", text: $viewModel.text, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...6)
                    .focused($isFocused)
                    .onChange(of: viewModel.text) { _, newValue in
                        // Detect @ mention trigger
                        if newValue.hasSuffix("@") || viewModel.isTypingMention {
                            viewModel.showAgentPicker = true
                        }
                    }

                // Send button
                Button {
                    Task {
                        await onSend()
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(viewModel.canSend ? .blue : .secondary)
                }
                .disabled(!viewModel.canSend)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Color(.systemBackground))
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Button {
                    viewModel.showAgentPicker = true
                } label: {
                    Text("@")
                        .font(.body.bold())
                }
                Spacer()
            }
        }
        .sheet(isPresented: $viewModel.showAttachmentPicker) {
            AttachmentPickerView(viewModel: viewModel)
        }
        .sheet(isPresented: $viewModel.showAgentPicker) {
            if let agentPickerVM {
                AgentPickerView(viewModel: agentPickerVM) { agent in
                    viewModel.addMention(agent: agent)
                }
            }
        }
    }
}

// MARK: - Attachment Chip

struct AttachmentChip: View {
    let title: String
    let icon: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
            Text(title)
                .font(.caption)
                .lineLimit(1)
            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption2)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color(.systemGray5))
        .clipShape(Capsule())
    }
}
