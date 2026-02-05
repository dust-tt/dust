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

    /// Activity level (0.0 = sleepy, 1.0 = active)
    var activityLevel: CGFloat {
        get {
            let value = defaults.double(forKey: Keys.activityLevel)
            // Default to 0.5 (balanced) if not set
            return defaults.object(forKey: Keys.activityLevel) != nil ? CGFloat(value) : 0.5
        }
        set {
            defaults.set(Double(newValue), forKey: Keys.activityLevel)
            NotificationCenter.default.post(name: .catPreferencesChanged, object: nil)
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
        return 50.0 * speed
    }

    /// Cat size adjusted by scale
    var catSize: CGSize {
        let baseSize: CGFloat = 64
        return CGSize(width: baseSize * scale, height: baseSize * scale)
    }

    /// Decision interval (how often to make new roaming decisions)
    var decisionInterval: TimeInterval {
        // Faster decisions when more active
        return 4.0 / Double(0.5 + activityLevel)
    }

    /// Walk probability (0-100)
    var walkProbability: Int {
        // More active = more walking (50-90%)
        return Int(50 + activityLevel * 40)
    }

    /// Sleep probability (0-100, from remaining after walk)
    var sleepProbability: Int {
        // Less active = more sleeping (2-15%)
        return Int(15 - activityLevel * 13)
    }

    // MARK: - Init

    private init() {}
}

// MARK: - Notification

extension Notification.Name {
    static let catPreferencesChanged = Notification.Name("catPreferencesChanged")
    static let catAttentionDismissed = Notification.Name("catAttentionDismissed")
}
