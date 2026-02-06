import Cocoa

/// A window that never steals focus from other apps
class NonActivatingWindow: NSWindow {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

class CatWindowController: NSWindowController {
    private var catView: CatView!
    private var roaming: RoamingBehavior!
    private var animator: CatAnimator!
    private let prefs = CatPreferences.shared

    private var pendingTarget: String?  // tmux target: session:window.pane
    private var pendingTitle: String?

    // Tooltip window for showing notification title
    private var tooltipWindow: NSWindow?
    private var tooltipLabel: NSTextField?
    private var tooltipTimer: Timer?

    convenience init() {
        let catSize = CatPreferences.shared.catSize

        let window = NonActivatingWindow(
            contentRect: NSRect(origin: .zero, size: catSize),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        window.isOpaque = false
        window.backgroundColor = .clear
        window.level = .floating
        window.hasShadow = false
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        window.ignoresMouseEvents = false
        window.acceptsMouseMovedEvents = true

        self.init(window: window)

        setupCat(in: window, size: catSize)
    }

    private func setupCat(in window: NSWindow, size: CGSize) {
        // Create the cat view
        catView = CatView(frame: NSRect(origin: .zero, size: size))
        catView.delegate = self
        window.contentView = catView

        // Setup animator
        animator = CatAnimator()
        animator.delegate = self
        animator.catType = prefs.catType

        // Setup roaming behavior
        roaming = RoamingBehavior()
        roaming.delegate = self

        // Start roaming when window appears
        if let screen = NSScreen.main {
            let visibleFrame = screen.visibleFrame
            roaming.start(in: visibleFrame, catSize: size)
        }

        // Start idle animation
        animator.play(.walk, loop: true)

        // Handle screen changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenDidChange),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil
        )

        // Handle preference changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(preferencesDidChange),
            name: .catPreferencesChanged,
            object: nil
        )

        // Setup tooltip window
        setupTooltip()
    }

    private func setupTooltip() {
        let tooltip = NonActivatingWindow(
            contentRect: NSRect(x: 0, y: 0, width: 200, height: 28),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        tooltip.isOpaque = false
        tooltip.backgroundColor = .clear
        tooltip.level = .floating
        tooltip.hasShadow = true
        tooltip.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        tooltip.ignoresMouseEvents = true

        // Use a background view for rounded corners
        let backgroundView = NSView(frame: NSRect(x: 0, y: 0, width: 200, height: 28))
        backgroundView.wantsLayer = true
        backgroundView.layer?.backgroundColor = NSColor.black.withAlphaComponent(0.75).cgColor
        backgroundView.layer?.cornerRadius = 6

        // Create centered label
        let label = NSTextField(labelWithString: "")
        label.font = NSFont.systemFont(ofSize: 12, weight: .medium)
        label.textColor = .white
        label.backgroundColor = .clear
        label.isBezeled = false
        label.isEditable = false
        label.alignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false

        backgroundView.addSubview(label)

        // Center label in background view using constraints
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: backgroundView.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: backgroundView.centerYAnchor)
        ])

        tooltip.contentView = backgroundView
        tooltipWindow = tooltip
        tooltipLabel = label
    }

    private func showTooltip(target: String?, title: String?) {
        guard let tooltip = tooltipWindow, let label = tooltipLabel else { return }

        // Extract session/worktree name from target (format: SESSION:WINDOW.PANE)
        let sessionName = target?.split(separator: ":").first.map(String.init)

        // Just show the worktree name
        let displayText = sessionName ?? "Notification"
        label.stringValue = displayText

        // Resize tooltip to fit text with padding
        let size = (displayText as NSString).size(withAttributes: [.font: label.font!])
        let width = max(size.width + 20, 80)
        let height: CGFloat = 28
        tooltip.setContentSize(NSSize(width: width, height: height))

        updateTooltipPosition()
        tooltip.orderFront(nil)

        // Auto-hide after 3 seconds
        tooltipTimer?.invalidate()
        tooltipTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { [weak self] _ in
            self?.hideTooltip()
        }
    }

    private func hideTooltip() {
        tooltipTimer?.invalidate()
        tooltipTimer = nil
        tooltipWindow?.orderOut(nil)
    }

    private func updateTooltipPosition() {
        guard let catWindow = window, let tooltip = tooltipWindow else { return }

        let catFrame = catWindow.frame
        let tooltipSize = tooltip.frame.size

        // Position tooltip above the cat, centered
        let x = catFrame.midX - tooltipSize.width / 2
        let y = catFrame.maxY + 2

        tooltip.setFrameOrigin(NSPoint(x: x, y: y))
    }

    @objc private func preferencesDidChange() {
        // Update cat type
        animator.catType = prefs.catType

        // Update size
        let newSize = prefs.catSize
        window?.setContentSize(newSize)
        catView.frame = NSRect(origin: .zero, size: newSize)

        // Update roaming bounds with new size
        if let screen = NSScreen.main {
            roaming.updateBounds(screen.visibleFrame)
            roaming.updateCatSize(newSize)
        }
    }

    @objc private func screenDidChange() {
        if let screen = NSScreen.main {
            roaming.updateBounds(screen.visibleFrame)
        }
    }

    // MARK: - Public API

    func pause() {
        roaming.pause()
        animator.pause()
    }

    func resume() {
        roaming.resume()
        animator.resume()
    }

    func triggerAttention(target: String?, title: String?) {
        pendingTarget = target
        pendingTitle = title

        // Make sure cat is visible and running (in case it was hidden)
        // Use orderFront instead of showWindow to avoid stealing focus
        window?.orderFront(nil)
        resume()

        roaming.triggerAttention(session: target, title: title)
        animator.play(.notification, loop: true)

        // Make window accept mouse events
        window?.ignoresMouseEvents = false

        // Show tooltip with session name (if enabled)
        if prefs.tooltipEnabled {
            showTooltip(target: target, title: title)
        }
    }

    func resetToIdle() {
        pendingTarget = nil
        pendingTitle = nil
        hideTooltip()
        roaming.resetToIdle()  // This triggers makeDecision() which sets state and calls roamingDidChangeState()
        NotificationCenter.default.post(name: .catAttentionDismissed, object: nil)
    }

    func handleStatusBarClick() {
        // Same behavior as clicking the cat
        if case .attentionNeeded = roaming.state {
            openTmuxSession()
        }
    }

    private func openTmuxSession() {
        // Switch to the right tmux pane if we have a target
        // Validate target to prevent command injection (only allow valid tmux target characters)
        if let target = pendingTarget, target != "default",
           target.range(of: "^[A-Za-z0-9_.:-]+$", options: .regularExpression) != nil {
            // Escape single quotes as defense in depth
            let safeTarget = target.replacingOccurrences(of: "'", with: "'\"'\"'")
            let task = Process()
            task.launchPath = "/bin/bash"
            let cmd = """
            TARGET='\(safeTarget)'
            CLIENT=$(tmux list-clients -F '#{client_name}' 2>/dev/null | head -1)
            if [ -n "$CLIENT" ]; then
                tmux switch-client -c "$CLIENT" -t "$TARGET" 2>/dev/null
            else
                tmux switch-client -t "$TARGET" 2>/dev/null
            fi
            """
            task.arguments = ["-c", cmd]
            try? task.run()
            task.waitUntilExit()
        }

        // Bring Alacritty to the front
        let script = """
        tell application "Alacritty"
            activate
        end tell
        """
        var error: NSDictionary?
        if let appleScript = NSAppleScript(source: script) {
            appleScript.executeAndReturnError(&error)
        }

        // Reset the cat
        resetToIdle()
    }
}

// MARK: - CatViewDelegate

extension CatWindowController: CatViewDelegate {
    func catViewWasClicked() {
        if case .attentionNeeded = roaming.state {
            openTmuxSession()
        }
    }

    func catViewDragDidBegin() {
        roaming.beginDragging()
    }

    func catViewWasDragged(to position: NSPoint) {
        roaming.endDragging(at: position)
    }
}

// MARK: - CatAnimatorDelegate

extension CatWindowController: CatAnimatorDelegate {
    func animatorDidUpdateFrame(_ image: NSImage) {
        catView.updateImage(image)
    }

    func animatorDidCompleteAnimation(_ type: AnimationType) {
        // When a non-looping animation completes, return to appropriate state
        switch roaming.state {
        case .attentionNeeded:
            animator.play(.notification, loop: true)
        default:
            animator.play(.walk, loop: true)
        }
    }
}

// MARK: - RoamingBehaviorDelegate

extension CatWindowController: RoamingBehaviorDelegate {
    func roamingDidChangeState(_ newState: CatState) {
        switch newState {
        case .idle:
            animator.play(.walk, loop: true, direction: roaming.direction)
        case .walking(let direction):
            animator.play(.walk, loop: true, direction: direction)
        case .sleeping:
            animator.play(.sleep, loop: true, direction: roaming.direction)
        case .attentionNeeded:
            animator.play(.notification, loop: true, direction: roaming.direction)
        }
    }

    func roamingDidUpdatePosition(_ position: CGPoint) {
        window?.setFrameOrigin(position)
        // Keep tooltip above the cat
        if case .attentionNeeded = roaming.state {
            updateTooltipPosition()
        }
    }

    func roamingDidChangeDirection(_ direction: Direction) {
        animator.updateDirection(direction)
    }
}
