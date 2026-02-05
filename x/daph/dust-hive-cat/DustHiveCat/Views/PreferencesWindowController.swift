import Cocoa

class PreferencesWindowController: NSWindowController {
    private let prefs = CatPreferences.shared

    private var catPopup: NSPopUpButton!
    private var scaleSlider: NSSlider!
    private var speedSlider: NSSlider!
    private var activitySlider: NSSlider!

    private var scaleLabel: NSTextField!
    private var speedLabel: NSTextField!
    private var activityLabel: NSTextField!
    private var launchAtLoginCheckbox: NSButton!

    convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 320, height: 320),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Cat Preferences"
        window.center()

        self.init(window: window)
        setupUI()
        loadPreferences()
    }

    private func setupUI() {
        guard let contentView = window?.contentView else { return }

        let padding: CGFloat = 20
        var y: CGFloat = 280

        // Cat Type
        let catLabel = createLabel("Cat:", at: NSPoint(x: padding, y: y))
        contentView.addSubview(catLabel)

        catPopup = NSPopUpButton(frame: NSRect(x: 100, y: y - 4, width: 180, height: 26))
        catPopup.target = self
        catPopup.action = #selector(catTypeChanged)
        for cat in CatType.allCats {
            catPopup.addItem(withTitle: cat.displayName)
            catPopup.lastItem?.representedObject = cat.id
        }
        contentView.addSubview(catPopup)

        y -= 50

        // Scale
        let scaleTitleLabel = createLabel("Size:", at: NSPoint(x: padding, y: y))
        contentView.addSubview(scaleTitleLabel)

        scaleSlider = NSSlider(frame: NSRect(x: 100, y: y, width: 140, height: 20))
        scaleSlider.minValue = 0.5
        scaleSlider.maxValue = 2.0
        scaleSlider.target = self
        scaleSlider.action = #selector(scaleChanged)
        contentView.addSubview(scaleSlider)

        scaleLabel = createLabel("1.0x", at: NSPoint(x: 250, y: y))
        contentView.addSubview(scaleLabel)

        y -= 50

        // Speed
        let speedTitleLabel = createLabel("Speed:", at: NSPoint(x: padding, y: y))
        contentView.addSubview(speedTitleLabel)

        speedSlider = NSSlider(frame: NSRect(x: 100, y: y, width: 140, height: 20))
        speedSlider.minValue = 0.5
        speedSlider.maxValue = 2.0
        speedSlider.target = self
        speedSlider.action = #selector(speedChanged)
        contentView.addSubview(speedSlider)

        speedLabel = createLabel("1.0x", at: NSPoint(x: 250, y: y))
        contentView.addSubview(speedLabel)

        y -= 50

        // Activity Level
        let activityTitleLabel = createLabel("Activity:", at: NSPoint(x: padding, y: y))
        contentView.addSubview(activityTitleLabel)

        activitySlider = NSSlider(frame: NSRect(x: 100, y: y, width: 140, height: 20))
        activitySlider.minValue = 0.0
        activitySlider.maxValue = 1.0
        activitySlider.target = self
        activitySlider.action = #selector(activityChanged)
        contentView.addSubview(activitySlider)

        activityLabel = createLabel("Balanced", at: NSPoint(x: 250, y: y))
        contentView.addSubview(activityLabel)

        y -= 20

        // Activity hints
        let sleepyLabel = createLabel("Sleepy", at: NSPoint(x: 100, y: y), size: 10, color: .secondaryLabelColor)
        contentView.addSubview(sleepyLabel)

        let activeLabel = createLabel("Active", at: NSPoint(x: 200, y: y), size: 10, color: .secondaryLabelColor)
        contentView.addSubview(activeLabel)

        y -= 40

        // Launch at Login
        launchAtLoginCheckbox = NSButton(checkboxWithTitle: "Launch at Login", target: self, action: #selector(launchAtLoginChanged))
        launchAtLoginCheckbox.frame = NSRect(x: padding, y: y, width: 200, height: 20)
        contentView.addSubview(launchAtLoginCheckbox)

        y -= 40

        // Reset button
        let resetButton = NSButton(frame: NSRect(x: padding, y: y, width: 100, height: 24))
        resetButton.title = "Reset Defaults"
        resetButton.bezelStyle = .rounded
        resetButton.target = self
        resetButton.action = #selector(resetDefaults)
        contentView.addSubview(resetButton)
    }

    private func createLabel(_ text: String, at point: NSPoint, size: CGFloat = 13, color: NSColor = .labelColor) -> NSTextField {
        let label = NSTextField(frame: NSRect(x: point.x, y: point.y, width: 80, height: 20))
        label.stringValue = text
        label.isEditable = false
        label.isBordered = false
        label.backgroundColor = .clear
        label.font = NSFont.systemFont(ofSize: size)
        label.textColor = color
        return label
    }

    private func loadPreferences() {
        // Cat type
        if let index = CatType.allCats.firstIndex(where: { $0.id == prefs.catType }) {
            catPopup.selectItem(at: index)
        }

        // Sliders
        scaleSlider.doubleValue = Double(prefs.scale)
        speedSlider.doubleValue = Double(prefs.speed)
        activitySlider.doubleValue = Double(prefs.activityLevel)

        // Launch at login
        launchAtLoginCheckbox.state = prefs.launchAtLogin ? .on : .off

        updateLabels()
    }

    private func updateLabels() {
        scaleLabel.stringValue = String(format: "%.1fx", scaleSlider.doubleValue)
        speedLabel.stringValue = String(format: "%.1fx", speedSlider.doubleValue)

        let activity = activitySlider.doubleValue
        if activity < 0.3 {
            activityLabel.stringValue = "Sleepy"
        } else if activity < 0.7 {
            activityLabel.stringValue = "Balanced"
        } else {
            activityLabel.stringValue = "Active"
        }
    }

    // MARK: - Actions

    @objc private func catTypeChanged() {
        if let catId = catPopup.selectedItem?.representedObject as? String {
            prefs.catType = catId
        }
    }

    @objc private func scaleChanged() {
        prefs.scale = CGFloat(scaleSlider.doubleValue)
        updateLabels()
    }

    @objc private func speedChanged() {
        prefs.speed = CGFloat(speedSlider.doubleValue)
        updateLabels()
    }

    @objc private func activityChanged() {
        prefs.activityLevel = CGFloat(activitySlider.doubleValue)
        updateLabels()
    }

    @objc private func launchAtLoginChanged() {
        prefs.launchAtLogin = launchAtLoginCheckbox.state == .on
    }

    @objc private func resetDefaults() {
        prefs.catType = CatType.default.id
        prefs.scale = 1.0
        prefs.speed = 1.0
        prefs.activityLevel = 0.5
        loadPreferences()
    }
}
