import Cocoa

protocol CatAnimatorDelegate: AnyObject {
    func animatorDidUpdateFrame(_ image: NSImage)
    func animatorDidCompleteAnimation(_ type: AnimationType)
}

/// Handles frame-by-frame animation of cat sprites
class CatAnimator {
    weak var delegate: CatAnimatorDelegate?

    private let spriteManager = SpriteManager.shared
    private var currentFrames: [NSImage] = []
    private var currentFrameIndex: Int = 0
    private var animationTimer: Timer?
    private var isLooping: Bool = true
    private var currentAnimation: AnimationType = .walk
    private var facingDirection: Direction = .right

    var catType: String = CatType.default.id {
        didSet {
            reloadCurrentAnimation()
        }
    }

    /// Frames per second for animations
    var fps: Double = 3.0

    // MARK: - Public Methods

    func play(_ animation: AnimationType, loop: Bool = true, direction: Direction = .right) {
        stop()

        currentAnimation = animation
        isLooping = loop
        facingDirection = direction

        currentFrames = spriteManager.loadFrames(catType: catType, animation: animation)

        // Flip frames if facing left
        if direction == .left {
            currentFrames = currentFrames.map { spriteManager.flipHorizontally($0) }
        }

        // Fallback: create a placeholder if no sprites loaded
        if currentFrames.isEmpty {
            print("Warning: No frames loaded for \(catType) \(animation.rawValue), using placeholder")
            currentFrames = [createPlaceholderImage()]
        }

        currentFrameIndex = 0

        // Show first frame immediately (don't wait for timer)
        if let firstFrame = currentFrames.first {
            delegate?.animatorDidUpdateFrame(firstFrame)
        }

        startTimer()
    }

    /// Creates a simple placeholder cat image when sprites fail to load
    private func createPlaceholderImage() -> NSImage {
        let size = NSSize(width: 64, height: 64)
        let image = NSImage(size: size)
        image.lockFocus()

        // Draw a simple cat shape
        NSColor.orange.setFill()
        let body = NSBezierPath(ovalIn: NSRect(x: 8, y: 8, width: 48, height: 40))
        body.fill()

        // Head
        let head = NSBezierPath(ovalIn: NSRect(x: 16, y: 32, width: 32, height: 28))
        head.fill()

        // Ears
        NSColor.orange.setFill()
        let leftEar = NSBezierPath()
        leftEar.move(to: NSPoint(x: 18, y: 52))
        leftEar.line(to: NSPoint(x: 12, y: 64))
        leftEar.line(to: NSPoint(x: 28, y: 56))
        leftEar.close()
        leftEar.fill()

        let rightEar = NSBezierPath()
        rightEar.move(to: NSPoint(x: 46, y: 52))
        rightEar.line(to: NSPoint(x: 52, y: 64))
        rightEar.line(to: NSPoint(x: 36, y: 56))
        rightEar.close()
        rightEar.fill()

        // Eyes
        NSColor.black.setFill()
        NSBezierPath(ovalIn: NSRect(x: 24, y: 42, width: 6, height: 8)).fill()
        NSBezierPath(ovalIn: NSRect(x: 34, y: 42, width: 6, height: 8)).fill()

        image.unlockFocus()
        return image
    }

    func stop() {
        animationTimer?.invalidate()
        animationTimer = nil
    }

    func pause() {
        animationTimer?.invalidate()
        animationTimer = nil
    }

    func resume() {
        guard animationTimer == nil, !currentFrames.isEmpty else { return }
        startTimer()
    }

    func updateDirection(_ direction: Direction) {
        guard direction != facingDirection else { return }
        facingDirection = direction

        // Flip all current frames
        currentFrames = currentFrames.map { spriteManager.flipHorizontally($0) }
    }

    // MARK: - Private Methods

    private func startTimer() {
        animationTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / fps, repeats: true) { [weak self] _ in
            self?.advanceFrame()
        }
    }

    private func advanceFrame() {
        guard !currentFrames.isEmpty else { return }

        let frame = currentFrames[currentFrameIndex]
        delegate?.animatorDidUpdateFrame(frame)

        currentFrameIndex += 1

        if currentFrameIndex >= currentFrames.count {
            if isLooping {
                currentFrameIndex = 0
            } else {
                stop()
                delegate?.animatorDidCompleteAnimation(currentAnimation)
            }
        }
    }

    private func reloadCurrentAnimation() {
        if animationTimer != nil {
            play(currentAnimation, loop: isLooping, direction: facingDirection)
        }
    }
}
