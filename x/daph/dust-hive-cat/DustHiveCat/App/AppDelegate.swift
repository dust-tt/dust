import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {
    var catWindowController: CatWindowController?
    var statusItem: NSStatusItem?
    var preferencesWindowController: PreferencesWindowController?

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

        case "reset":
            catWindowController?.resetToIdle()

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

    private func setupStatusBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "cat.fill", accessibilityDescription: "Dust Cat")
        }

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Show Cat", action: #selector(showCat), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Hide Cat", action: #selector(hideCat), keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Preferences...", action: #selector(showPreferences), keyEquivalent: ","))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        statusItem?.menu = menu
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
}
