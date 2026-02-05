import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {
    var catWindowController: CatWindowController?
    var statusItem: NSStatusItem?
    var preferencesWindowController: PreferencesWindowController?

    // Status bar animation
    private var statusBarAnimationTimer: Timer?
    private var statusBarFrameIndex: Int = 0
    private var statusBarFrames: [NSImage] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Create the cat window
        catWindowController = CatWindowController()
        catWindowController?.showWindow(nil)

        // Create a status bar item for easy access
        setupStatusBar()

        // Register for URL scheme
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleURLEvent(_:withReply:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false  // Keep running even if window is closed
    }

    // MARK: - URL Scheme Handling (dustcat://notify?session=xxx)

    @objc func handleURLEvent(_ event: NSAppleEventDescriptor, withReply reply: NSAppleEventDescriptor) {
        guard let urlString = event.paramDescriptor(forKeyword: AEKeyword(keyDirectObject))?.stringValue,
              let url = URL(string: urlString) else {
            return
        }

        handleIncomingURL(url)
    }

    func handleIncomingURL(_ url: URL) {
        guard url.scheme == "dustcat" else { return }

        switch url.host {
        case "notify":
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            let target = components?.queryItems?.first(where: { $0.name == "target" })?.value?
                .removingPercentEncoding  // Decode %3A -> : and %2E -> .
            let title = components?.queryItems?.first(where: { $0.name == "title" })?.value

            catWindowController?.triggerAttention(target: target, title: title)
            startStatusBarAnimation()

        case "reset":
            catWindowController?.resetToIdle()
            stopStatusBarAnimation()

        default:
            break
        }
    }

    // Also handle URLs passed via application(_:open:)
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            handleIncomingURL(url)
        }
    }

    // MARK: - Status Bar

    private var statusBarMenu: NSMenu?

    private func setupStatusBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        updateStatusBarIcon()

        // Listen for preference changes to update icon
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(updateStatusBarIcon),
            name: .catPreferencesChanged,
            object: nil
        )

        // Listen for attention dismissed to stop animation
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAttentionDismissed),
            name: .catAttentionDismissed,
            object: nil
        )

        // Create menu (shown on right-click only)
        statusBarMenu = NSMenu()
        statusBarMenu?.addItem(NSMenuItem(title: "Show Cat", action: #selector(showCat), keyEquivalent: ""))
        statusBarMenu?.addItem(NSMenuItem(title: "Hide Cat", action: #selector(hideCat), keyEquivalent: ""))
        statusBarMenu?.addItem(NSMenuItem.separator())
        statusBarMenu?.addItem(NSMenuItem(title: "Preferences...", action: #selector(showPreferences), keyEquivalent: ","))
        statusBarMenu?.addItem(NSMenuItem.separator())
        statusBarMenu?.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        // Don't set menu directly - we'll handle clicks manually
        if let button = statusItem?.button {
            button.target = self
            button.action = #selector(statusBarClicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
    }

    @objc private func statusBarClicked(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else { return }

        if event.type == .rightMouseUp {
            // Right click - show menu
            if let menu = statusBarMenu, let button = statusItem?.button {
                menu.popUp(positioning: nil, at: NSPoint(x: 0, y: button.bounds.height + 5), in: button)
            }
        } else {
            // Left click - same as clicking the cat
            catWindowController?.handleStatusBarClick()
        }
    }

    @objc private func updateStatusBarIcon() {
        guard let button = statusItem?.button else { return }

        // Load custom status bar icon
        if let resourcePath = Bundle.main.resourcePath {
            let path = "\(resourcePath)/statusbar/icon_1.png"
            if let image = NSImage(contentsOfFile: path) {
                button.image = resizeForStatusBar(image)
                return
            }
        }

        // Fallback to system icon
        button.image = NSImage(systemSymbolName: "cat.fill", accessibilityDescription: "Dust Cat")
    }

    @objc func showCat() {
        catWindowController?.showWindow(nil)
    }

    @objc func hideCat() {
        catWindowController?.window?.orderOut(nil)
    }

    @objc func showPreferences() {
        if preferencesWindowController == nil {
            preferencesWindowController = PreferencesWindowController()
        }
        preferencesWindowController?.showWindow(nil)
        preferencesWindowController?.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func handleAttentionDismissed() {
        stopStatusBarAnimation()
    }

    // MARK: - Status Bar Animation

    private func startStatusBarAnimation() {
        // Load custom status bar animation frames
        statusBarFrames = []

        if let resourcePath = Bundle.main.resourcePath {
            for i in 1...6 {
                let path = "\(resourcePath)/statusbar/icon_\(i).png"
                if let image = NSImage(contentsOfFile: path) {
                    statusBarFrames.append(resizeForStatusBar(image))
                }
            }
        }

        guard !statusBarFrames.isEmpty else { return }

        statusBarFrameIndex = 0
        statusBarAnimationTimer?.invalidate()
        statusBarAnimationTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            self?.advanceStatusBarFrame()
        }
    }

    private func stopStatusBarAnimation() {
        statusBarAnimationTimer?.invalidate()
        statusBarAnimationTimer = nil
        updateStatusBarIcon()
    }

    private func advanceStatusBarFrame() {
        guard let button = statusItem?.button, !statusBarFrames.isEmpty else { return }

        button.image = statusBarFrames[statusBarFrameIndex]
        statusBarFrameIndex = (statusBarFrameIndex + 1) % statusBarFrames.count
    }

    private func resizeForStatusBar(_ image: NSImage) -> NSImage {
        let resized = NSImage(size: NSSize(width: 26, height: 26))
        resized.lockFocus()
        image.draw(in: NSRect(x: 0, y: 0, width: 26, height: 26),
                  from: NSRect(origin: .zero, size: image.size),
                  operation: .sourceOver,
                  fraction: 1.0)
        resized.unlockFocus()
        resized.isTemplate = false
        return resized
    }
}
