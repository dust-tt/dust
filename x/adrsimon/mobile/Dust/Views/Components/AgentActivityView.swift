import SparkleTokens
import SwiftUI

struct AgentActivityView: View {
    private struct ToolUse: Identifiable {
        let id: String
        let label: String
        let serverName: String?
        let isRunning: Bool
    }

    private static let animation = Animation.snappy(duration: 0.25)
    private static let maxStackedIcons = 3

    let phase: AgentStreamingPhase
    let completedSteps: [ActivityStep]
    let activeActions: [ActiveAction]
    let isStreaming: Bool
    let hasText: Bool

    @State private var isExpanded = false

    private var tools: [ToolUse] {
        let completed = completedSteps.compactMap { step -> ToolUse? in
            guard case let .action(id, label, serverName) = step else { return nil }
            return ToolUse(id: id, label: label, serverName: serverName, isRunning: false)
        }
        let running = activeActions.map {
            ToolUse(id: "active-\($0.id)", label: $0.label, serverName: $0.serverName, isRunning: true)
        }
        return completed + running
    }

    private var isBlocked: Bool {
        switch phase {
        case .personalAuthRequired, .fileAuthRequired, .approvalRequired, .userQuestionRequired: true
        case .idle, .thinking, .generating: false
        }
    }

    private var isWorking: Bool {
        isStreaming && !isBlocked && (!activeActions.isEmpty || !hasText)
    }

    var body: some View {
        let tools = tools
        if isWorking || !tools.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                chip(tools: tools)

                if isExpanded, !tools.isEmpty {
                    toolList(tools)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .animation(Self.animation, value: isExpanded)
            .animation(Self.animation, value: tools.map(\.id))
        }
    }

    // MARK: - Chip

    private func chip(tools: [ToolUse]) -> some View {
        Button {
            isExpanded.toggle()
        } label: {
            HStack(spacing: 6) {
                if isWorking {
                    workingIcon
                } else {
                    stackedIcons(tools)
                }

                Text(label(tools: tools))
                    .sparkleCopyXs()
                    .foregroundStyle(Color.dustFaint)
                    .lineLimit(1)
                    .shimmering(isWorking)
                    .contentTransition(.opacity)

                if !tools.isEmpty {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(Color.dustFaint)
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.dustMutedBackground, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(tools.isEmpty)
    }

    @ViewBuilder
    private var workingIcon: some View {
        if let icon = activeActions.last?.serverName.flatMap(MCPServerIcon.icon(for:)) {
            icon.image
                .resizable()
                .scaledToFit()
                .frame(width: 12, height: 12)
        } else {
            Image(systemName: "sparkle")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Color.highlight)
                .symbolEffect(.pulse, options: .repeating)
        }
    }

    private func stackedIcons(_ tools: [ToolUse]) -> some View {
        var seen = Set<String>()
        let servers = tools.compactMap(\.serverName).filter { seen.insert($0).inserted }
        return HStack(spacing: -4) {
            ForEach(servers.prefix(Self.maxStackedIcons), id: \.self) { server in
                ToolIcon(serverName: server, size: 12)
                    .padding(2)
                    .background(Color.dustBackground, in: Circle())
            }
            if servers.isEmpty {
                ToolIcon(serverName: nil, size: 12)
            }
        }
    }

    private func label(tools: [ToolUse]) -> String {
        if isWorking {
            if let action = activeActions.last { return action.label }
            return phase == .generating ? "Writing" : "Thinking"
        }
        return tools.count == 1 ? "Used 1 tool" : "Used \(tools.count) tools"
    }

    // MARK: - Tool list

    private func toolList(_ tools: [ToolUse]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(tools) { tool in
                HStack(spacing: 8) {
                    ToolIcon(serverName: tool.serverName, size: 12)
                        .opacity(tool.isRunning ? 1 : 0.7)

                    Text(tool.label)
                        .sparkleCopyXs()
                        .foregroundStyle(Color.dustFaint)
                        .lineLimit(1)
                        .shimmering(tool.isRunning)
                }
            }
        }
        .padding(.leading, 10)
    }
}

// MARK: - Tool Icon

private struct ToolIcon: View {
    let serverName: String?
    let size: CGFloat

    var body: some View {
        if let icon = serverName.flatMap(MCPServerIcon.icon(for:)) {
            icon.image
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
        } else {
            Image(systemName: "wrench.and.screwdriver")
                .font(.system(size: size - 3))
                .foregroundStyle(Color.dustFaint)
                .frame(width: size, height: size)
        }
    }
}

// MARK: - Shimmer

private struct Shimmer: ViewModifier {
    private static let period: TimeInterval = 1.6
    private static let bandWidth: CGFloat = 0.35

    func body(content: Content) -> some View {
        content.overlay {
            TimelineView(.animation) { context in
                let progress = context.date.timeIntervalSinceReferenceDate
                    .truncatingRemainder(dividingBy: Self.period) / Self.period
                GeometryReader { geometry in
                    let width = geometry.size.width
                    LinearGradient(
                        colors: [.clear, Color.dustForeground, .clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: width * Self.bandWidth)
                    .offset(x: (1 + Self.bandWidth) * width * progress - Self.bandWidth * width)
                }
            }
            .mask(content)
            .allowsHitTesting(false)
        }
    }
}

private extension View {
    @ViewBuilder
    func shimmering(_ isActive: Bool) -> some View {
        if isActive {
            modifier(Shimmer())
        } else {
            self
        }
    }
}
