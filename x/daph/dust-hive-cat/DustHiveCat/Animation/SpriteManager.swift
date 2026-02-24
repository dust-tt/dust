import Cocoa

/// Manages loading and caching of cat sprites
class SpriteManager {
    static let shared = SpriteManager()

    private var cache: [String: [NSImage]] = [:]

    /// Number of frames per animation
    private let frameCount = 6

    /// Cat types that share sprites with another cat (alias -> source)
    private let spriteAliases: [String: String] = [
        "chawy": "soupinou"
    ]

    private init() {}

    /// Load animation frames for a specific cat and animation type
    func loadFrames(catType: String, animation: AnimationType) -> [NSImage] {
        let cacheKey = "\(catType)_\(animation.rawValue)"

        if let cached = cache[cacheKey] {
            return cached
        }

        // Resolve alias (e.g., chawy -> soupinou)
        let sourceCatType = spriteAliases[catType] ?? catType

        var frames: [NSImage] = []

        // Try loading from bundle Resources first
        frames = loadFromResources(catType: sourceCatType, animation: animation.rawValue)

        // Fallback to NSImage(named:) for Asset Catalog
        if frames.isEmpty {
            for i in 0..<frameCount {
                let frameName = String(format: "%02d_%@_%@", i, sourceCatType, animation.rawValue)
                if let image = NSImage(named: frameName) {
                    frames.append(image)
                }
            }
        }

        cache[cacheKey] = frames
        return frames
    }

    /// Load frames from the Resources folder (PNG files)
    private func loadFromResources(catType: String, animation: String) -> [NSImage] {
        var frames: [NSImage] = []

        guard let resourcePath = Bundle.main.resourcePath else {
            return frames
        }

        // Look in catType subfolder
        for i in 0..<frameCount {
            let frameName = String(format: "%02d_%@_%@", i, catType, animation)
            let path = "\(resourcePath)/\(catType)/\(frameName).png"

            if let image = NSImage(contentsOfFile: path) {
                frames.append(image)
            }
        }

        // If not found in subfolder, try in Bundle.module (Swift PM resource bundle)
        if frames.isEmpty {
            let modulePath = Bundle.module.resourcePath ?? Bundle.module.bundlePath
            for i in 0..<frameCount {
                let frameName = String(format: "%02d_%@_%@", i, catType, animation)
                let path = "\(modulePath)/\(catType)/\(frameName).png"
                if let image = NSImage(contentsOfFile: path) {
                    frames.append(image)
                }
            }
        }

        return frames
    }

    /// Flip an image horizontally (for left-facing movement)
    func flipHorizontally(_ image: NSImage) -> NSImage {
        let flipped = NSImage(size: image.size)
        flipped.lockFocus()

        let transform = NSAffineTransform()
        transform.translateX(by: image.size.width, yBy: 0)
        transform.scaleX(by: -1, yBy: 1)
        transform.concat()

        image.draw(at: .zero, from: NSRect(origin: .zero, size: image.size), operation: .sourceOver, fraction: 1.0)

        flipped.unlockFocus()
        return flipped
    }

    /// Clear the cache (useful if assets are updated)
    func clearCache() {
        cache.removeAll()
    }
}
