import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var catWindowController: CatWindowController?
    var statusItem: NSStatusItem?

    // Status bar animation
    private var statusBarAnimationTimer: Timer?
    private var statusBarFrameIndex: Int = 0
    private var statusBarFrames: [NSImage] = []

    // Hotkey monitoring (double-tap Option)
    private var globalEventMonitor: Any?
    private var localEventMonitor: Any?
    private var lastOptionPressTime: Date?
    private var optionWasPressed: Bool = false
    private let doubleTapThreshold: TimeInterval = 0.4

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

        // Setup hotkey monitoring
        setupHotkeyMonitor()

        // Listen for hotkey preference changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(hotkeyPreferenceChanged),
            name: .catHotkeyPreferenceChanged,
            object: nil
        )
    }

    // MARK: - Hotkey Monitoring (Double-tap Option)

    private func setupHotkeyMonitor() {
        guard CatPreferences.shared.hotkeyEnabled else { return }

        // Global monitor for events sent to other apps
        globalEventMonitor = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            self?.handleFlagsChanged(event)
        }

        // Local monitor for events sent to our app (or when no app has focus)
        localEventMonitor = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            self?.handleFlagsChanged(event)
            return event
        }
    }

    private func teardownHotkeyMonitor() {
        if let monitor = globalEventMonitor {
            NSEvent.removeMonitor(monitor)
            globalEventMonitor = nil
        }
        if let monitor = localEventMonitor {
            NSEvent.removeMonitor(monitor)
            localEventMonitor = nil
        }
    }

    @objc private func hotkeyPreferenceChanged() {
        teardownHotkeyMonitor()
        if CatPreferences.shared.hotkeyEnabled {
            setupHotkeyMonitor()
        }
    }

    private func handleFlagsChanged(_ event: NSEvent) {
        let optionIsPressed = event.modifierFlags.contains(.option)

        // Detect rising edge: option just pressed (wasn't pressed before)
        if optionIsPressed && !optionWasPressed {
            let now = Date()
            if let lastPress = lastOptionPressTime,
               now.timeIntervalSince(lastPress) < doubleTapThreshold {
                // Double-tap detected!
                lastOptionPressTime = nil
                handleHotkeyActivated()
            } else {
                lastOptionPressTime = now
            }
        }

        optionWasPressed = optionIsPressed
    }

    private func handleHotkeyActivated() {
        // Same as clicking the cat when in attention mode
        catWindowController?.handleStatusBarClick()
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
            // URL decode title: replace + with space (form encoding), then percent-decode
            let title = components?.queryItems?.first(where: { $0.name == "title" })?.value?
                .replacingOccurrences(of: "+", with: " ")

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

        // Pet submenu
        let petItem = NSMenuItem(title: "Pet", action: nil, keyEquivalent: "")
        let petMenu = NSMenu()
        for cat in CatType.allCats {
            let item = NSMenuItem(title: cat.displayName, action: #selector(selectPet(_:)), keyEquivalent: "")
            item.representedObject = cat.id
            petMenu.addItem(item)
        }
        petItem.submenu = petMenu
        statusBarMenu?.addItem(petItem)

        // Size submenu
        let sizeItem = NSMenuItem(title: "Size", action: nil, keyEquivalent: "")
        let sizeMenu = NSMenu()
        for size in ["0.5x", "0.75x", "1x", "1.25x", "1.5x", "2x"] {
            let item = NSMenuItem(title: size, action: #selector(selectSize(_:)), keyEquivalent: "")
            item.representedObject = size
            sizeMenu.addItem(item)
        }
        sizeItem.submenu = sizeMenu
        statusBarMenu?.addItem(sizeItem)

        // Speed submenu
        let speedItem = NSMenuItem(title: "Speed", action: nil, keyEquivalent: "")
        let speedMenu = NSMenu()
        for speed in ["0.5x", "0.75x", "1x", "1.25x", "1.5x", "2x"] {
            let item = NSMenuItem(title: speed, action: #selector(selectSpeed(_:)), keyEquivalent: "")
            item.representedObject = speed
            speedMenu.addItem(item)
        }
        speedItem.submenu = speedMenu
        statusBarMenu?.addItem(speedItem)

        // Activity submenu
        let activityItem = NSMenuItem(title: "Activity", action: nil, keyEquivalent: "")
        let activityMenu = NSMenu()
        for (label, value) in [("10% (Sleepy)", 0.1), ("20%", 0.2), ("30%", 0.3), ("40% (Default)", 0.4), ("50%", 0.5), ("60%", 0.6), ("70%", 0.7), ("80%", 0.8), ("90% (Active)", 0.9)] {
            let item = NSMenuItem(title: label, action: #selector(selectActivity(_:)), keyEquivalent: "")
            item.representedObject = value
            activityMenu.addItem(item)
        }
        activityItem.submenu = activityMenu
        statusBarMenu?.addItem(activityItem)

        // Roaming Radius submenu
        let radiusItem = NSMenuItem(title: "Roaming Radius", action: nil, keyEquivalent: "")
        let radiusMenu = NSMenu()
        for (label, value) in [("Small (100px)", 100.0), ("Medium (150px)", 150.0), ("Large (250px)", 250.0), ("Extra Large (400px)", 400.0), ("Unlimited", 0.0)] {
            let item = NSMenuItem(title: label, action: #selector(selectRoamingRadius(_:)), keyEquivalent: "")
            item.representedObject = value
            radiusMenu.addItem(item)
        }
        radiusItem.submenu = radiusMenu
        statusBarMenu?.addItem(radiusItem)

        // Launch at login
        let launchItem = NSMenuItem(title: "Launch at Login", action: #selector(toggleLaunchAtLogin(_:)), keyEquivalent: "")
        statusBarMenu?.addItem(launchItem)

        // Hotkey toggle
        let hotkeyItem = NSMenuItem(title: "Hotkey (⌥⌥)", action: #selector(toggleHotkey(_:)), keyEquivalent: "")
        statusBarMenu?.addItem(hotkeyItem)

        // Tooltip toggle
        let tooltipItem = NSMenuItem(title: "Show env tooltip", action: #selector(toggleTooltip(_:)), keyEquivalent: "")
        statusBarMenu?.addItem(tooltipItem)

        statusBarMenu?.addItem(NSMenuItem.separator())
        statusBarMenu?.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        statusBarMenu?.delegate = self

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

        // Load sleeping cat icon for idle state
        if let resourcePath = Bundle.main.resourcePath {
            let path = "\(resourcePath)/statusbar/icon_idle.png"
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
        catWindowController?.resume()
    }

    @objc func hideCat() {
        catWindowController?.window?.orderOut(nil)
        catWindowController?.pause()
    }

    @objc private func selectPet(_ sender: NSMenuItem) {
        guard let catId = sender.representedObject as? String else { return }
        CatPreferences.shared.catType = catId
    }

    @objc private func selectSize(_ sender: NSMenuItem) {
        guard let sizeStr = sender.representedObject as? String else { return }
        let value = Double(sizeStr.replacingOccurrences(of: "x", with: "")) ?? 1.0
        CatPreferences.shared.scale = CGFloat(value)
    }

    @objc private func selectSpeed(_ sender: NSMenuItem) {
        guard let speedStr = sender.representedObject as? String else { return }
        let value = Double(speedStr.replacingOccurrences(of: "x", with: "")) ?? 1.0
        CatPreferences.shared.speed = CGFloat(value)
    }

    @objc private func selectActivity(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? Double else { return }
        CatPreferences.shared.activityLevel = CGFloat(value)
    }

    @objc private func selectRoamingRadius(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? Double else { return }
        CatPreferences.shared.roamingRadius = CGFloat(value)
    }

    @objc private func toggleLaunchAtLogin(_ sender: NSMenuItem) {
        CatPreferences.shared.launchAtLogin = !CatPreferences.shared.launchAtLogin
    }

    @objc private func toggleHotkey(_ sender: NSMenuItem) {
        CatPreferences.shared.hotkeyEnabled = !CatPreferences.shared.hotkeyEnabled
    }

    @objc private func toggleTooltip(_ sender: NSMenuItem) {
        CatPreferences.shared.tooltipEnabled = !CatPreferences.shared.tooltipEnabled
    }

    @objc private func handleAttentionDismissed() {
        stopStatusBarAnimation()
    }

    // MARK: - NSMenuDelegate

    func menuWillOpen(_ menu: NSMenu) {
        let prefs = CatPreferences.shared

        // Update checkmarks for Pet submenu
        if let petItem = menu.item(withTitle: "Pet"), let petMenu = petItem.submenu {
            for item in petMenu.items {
                item.state = (item.representedObject as? String) == prefs.catType ? .on : .off
            }
        }

        // Update checkmarks for Size submenu
        if let sizeItem = menu.item(withTitle: "Size"), let sizeMenu = sizeItem.submenu {
            let currentSize = String(format: "%.2gx", Double(prefs.scale))
            for item in sizeMenu.items {
                let itemSize = item.representedObject as? String ?? ""
                item.state = itemSize == currentSize ? .on : .off
            }
        }

        // Update checkmarks for Speed submenu
        if let speedItem = menu.item(withTitle: "Speed"), let speedMenu = speedItem.submenu {
            let currentSpeed = String(format: "%.2gx", Double(prefs.speed))
            for item in speedMenu.items {
                let itemSpeed = item.representedObject as? String ?? ""
                item.state = itemSpeed == currentSpeed ? .on : .off
            }
        }

        // Update checkmarks for Activity submenu
        if let activityItem = menu.item(withTitle: "Activity"), let activityMenu = activityItem.submenu {
            for item in activityMenu.items {
                if let value = item.representedObject as? Double {
                    item.state = abs(value - Double(prefs.activityLevel)) < 0.05 ? .on : .off
                }
            }
        }

        // Update checkmarks for Roaming Radius submenu
        if let radiusItem = menu.item(withTitle: "Roaming Radius"), let radiusMenu = radiusItem.submenu {
            for item in radiusMenu.items {
                if let value = item.representedObject as? Double {
                    item.state = abs(value - Double(prefs.roamingRadius)) < 1 ? .on : .off
                }
            }
        }

        // Update Launch at Login checkmark
        if let launchItem = menu.item(withTitle: "Launch at Login") {
            launchItem.state = prefs.launchAtLogin ? .on : .off
        }

        // Update Hotkey checkmark
        if let hotkeyItem = menu.item(withTitle: "Hotkey (⌥⌥)") {
            hotkeyItem.state = prefs.hotkeyEnabled ? .on : .off
        }

        // Update Tooltip checkmark
        if let tooltipItem = menu.item(withTitle: "Show env tooltip") {
            tooltipItem.state = prefs.tooltipEnabled ? .on : .off
        }
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
        let padding: CGFloat = 4
        let iconSize: CGFloat = 22
        let resized = NSImage(size: NSSize(width: 26, height: 26))
        resized.lockFocus()
        // Draw smaller icon with padding at the bottom
        image.draw(in: NSRect(x: (26 - iconSize) / 2, y: padding, width: iconSize, height: iconSize),
                  from: NSRect(origin: .zero, size: image.size),
                  operation: .sourceOver,
                  fraction: 1.0)
        resized.unlockFocus()
        resized.isTemplate = false
        return resized
    }
}
