import Foundation
import ServiceManagement

/// Manages user preferences for the cat
class CatPreferences {
    static let shared = CatPreferences()

    private let defaults = UserDefaults.standard

    // MARK: - Keys

    private enum Keys {
        static let catType = "catType"
        static let scale = "scale"
        static let speed = "speed"
        static let activityLevel = "activityLevel"
        static let roamingRadius = "roamingRadius"
        static let hotkeyEnabled = "hotkeyEnabled"
        static let tooltipEnabled = "tooltipEnabled"
        static let terminalApp = "terminalApp"
    }

    // MARK: - Properties

    /// The selected cat skin ID
    var catType: String {
        get { defaults.string(forKey: Keys.catType) ?? CatType.default.id }
        set {
            defaults.set(newValue, forKey: Keys.catType)
            NotificationCenter.default.post(name: .catPreferencesChanged, object: nil)
        }
    }

    /// Scale multiplier (0.5 to 2.0)
    var scale: CGFloat {
        get {
            let value = defaults.double(forKey: Keys.scale)
            return value > 0 ? CGFloat(value) : 1.0
        }
        set {
            defaults.set(Double(newValue), forKey: Keys.scale)
            NotificationCenter.default.post(name: .catPreferencesChanged, object: nil)
        }
    }

    /// Speed multiplier (0.5 to 2.0)
    var speed: CGFloat {
        get {
            let value = defaults.double(forKey: Keys.speed)
            return value > 0 ? CGFloat(value) : 1.0
        }
        set {
            defaults.set(Double(newValue), forKey: Keys.speed)
            NotificationCenter.default.post(name: .catPreferencesChanged, object: nil)
        }
    }

    /// Activity level (0.1 to 0.9) - controls walk vs sleep probability
    var activityLevel: CGFloat {
        get {
            let value = defaults.double(forKey: Keys.activityLevel)
            // Default to 0.4 (40% walk, 60% sleep) if not set
            return defaults.object(forKey: Keys.activityLevel) != nil ? CGFloat(value) : 0.4
        }
        set {
            defaults.set(Double(newValue), forKey: Keys.activityLevel)
            NotificationCenter.default.post(name: .catPreferencesChanged, object: nil)
        }
    }

    /// Walk probability (10-90%) based on activity level
    var walkProbability: Int {
        return Int(activityLevel * 100)
    }

    /// Roaming radius in pixels (0 = unlimited, otherwise 100-500)
    var roamingRadius: CGFloat {
        get {
            let value = defaults.double(forKey: Keys.roamingRadius)
            // Default to 150px if not set
            return defaults.object(forKey: Keys.roamingRadius) != nil ? CGFloat(value) : 150
        }
        set {
            defaults.set(Double(newValue), forKey: Keys.roamingRadius)
            NotificationCenter.default.post(name: .catPreferencesChanged, object: nil)
        }
    }

    /// Whether the double-tap Option hotkey is enabled
    var hotkeyEnabled: Bool {
        get {
            // Default to true if not set
            return defaults.object(forKey: Keys.hotkeyEnabled) != nil ? defaults.bool(forKey: Keys.hotkeyEnabled) : true
        }
        set {
            defaults.set(newValue, forKey: Keys.hotkeyEnabled)
            NotificationCenter.default.post(name: .catHotkeyPreferenceChanged, object: nil)
        }
    }

    /// The terminal app to activate and detect as focused (e.g. "Alacritty", "Ghostty")
    var terminalApp: String {
        get { defaults.string(forKey: Keys.terminalApp) ?? "Alacritty" }
        set {
            defaults.set(newValue, forKey: Keys.terminalApp)
            NotificationCenter.default.post(name: .catPreferencesChanged, object: nil)
        }
    }

    /// Whether to show tooltip with worktree name on notification
    var tooltipEnabled: Bool {
        get {
            // Default to false if not set
            return defaults.object(forKey: Keys.tooltipEnabled) != nil ? defaults.bool(forKey: Keys.tooltipEnabled) : false
        }
        set {
            defaults.set(newValue, forKey: Keys.tooltipEnabled)
        }
    }

    /// Launch at login (uses SMAppService on macOS 13+)
    var launchAtLogin: Bool {
        get {
            if #available(macOS 13.0, *) {
                return SMAppService.mainApp.status == .enabled
            }
            return false
        }
        set {
            if #available(macOS 13.0, *) {
                do {
                    if newValue {
                        try SMAppService.mainApp.register()
                    } else {
                        try SMAppService.mainApp.unregister()
                    }
                } catch {
                    print("Failed to set launch at login: \(error)")
                }
            }
        }
    }

    // MARK: - Computed Properties

    /// Walk speed in pixels per second, adjusted by speed preference
    var walkSpeed: CGFloat {
        return 30.0 * speed
    }

    /// Cat size adjusted by scale
    var catSize: CGSize {
        let baseSize: CGFloat = 64
        return CGSize(width: baseSize * scale, height: baseSize * scale)
    }

    // MARK: - Init

    private init() {}
}

// MARK: - Notification

extension Notification.Name {
    static let catPreferencesChanged = Notification.Name("catPreferencesChanged")
    static let catAttentionDismissed = Notification.Name("catAttentionDismissed")
    static let catHotkeyPreferenceChanged = Notification.Name("catHotkeyPreferenceChanged")
}
