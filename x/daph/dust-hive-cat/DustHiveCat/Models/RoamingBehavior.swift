import AppKit

protocol RoamingBehaviorDelegate: AnyObject {
    func roamingDidChangeState(_ newState: CatState)
    func roamingDidUpdatePosition(_ position: CGPoint)
    func roamingDidChangeDirection(_ direction: Direction)
}

/// Handles the roaming/movement logic for the cat
class RoamingBehavior {
    weak var delegate: RoamingBehaviorDelegate?

    private(set) var state: CatState = .idle {
        didSet {
            // Update movement timer first, then notify delegate
            // so the delegate can override (e.g. pause during transitions)
            updateMovementTimerForState()
            delegate?.roamingDidChangeState(state)
        }
    }

    private(set) var position: CGPoint = .zero
    private(set) var direction: Direction = .right
    private(set) var isDragging: Bool = false
    private(set) var homePosition: CGPoint = .zero

    private var screenBounds: CGRect = .zero
    private var catSize: CGSize = CGSize(width: 64, height: 64)

    private var movementTimer: Timer?
    private var decisionTimer: Timer?
    private var targetPosition: CGPoint?

    private let prefs = CatPreferences.shared

    /// Movement speed in pixels per second (uses preferences)
    var walkSpeed: CGFloat {
        return prefs.walkSpeed
    }

    /// How often to make a new decision (in seconds)
    var decisionInterval: TimeInterval {
        return 4.0
    }

    // MARK: - Public Methods

    func start(in bounds: CGRect, catSize: CGSize) {
        self.screenBounds = bounds
        self.catSize = catSize

        // Start at random position and set as home
        position = randomScreenPosition()
        homePosition = position
        delegate?.roamingDidUpdatePosition(position)

        // Start decision loop
        decisionTimer = Timer.scheduledTimer(withTimeInterval: decisionInterval, repeats: true) { [weak self] _ in
            self?.makeDecision()
        }

        // Initial decision (this will start movement timer if needed via state change)
        makeDecision()
    }

    /// Only run the 60fps movement timer when actually moving (walking or attention bounce)
    private func updateMovementTimerForState() {
        switch state {
        case .walking, .attentionNeeded:
            // Need movement timer
            if movementTimer == nil {
                movementTimer = Timer.scheduledTimer(withTimeInterval: 1.0/60.0, repeats: true) { [weak self] _ in
                    self?.updateMovement()
                }
            }
        case .idle, .sleeping:
            // Don't need movement timer - save CPU
            movementTimer?.invalidate()
            movementTimer = nil
        }
    }

    func stop() {
        movementTimer?.invalidate()
        decisionTimer?.invalidate()
        movementTimer = nil
        decisionTimer = nil
    }

    func pause() {
        movementTimer?.invalidate()
        decisionTimer?.invalidate()
        movementTimer = nil
        decisionTimer = nil
    }

    func resume() {
        guard decisionTimer == nil else { return }  // Already running
        // Restart decision loop
        decisionTimer = Timer.scheduledTimer(withTimeInterval: decisionInterval, repeats: true) { [weak self] _ in
            self?.makeDecision()
        }
        // Movement timer will be started by state if needed
        updateMovementTimerForState()
    }

    func updateBounds(_ bounds: CGRect) {
        self.screenBounds = bounds
        clampPosition()
    }

    func updateCatSize(_ size: CGSize) {
        self.catSize = size
        clampPosition()
    }

    func setPosition(_ newPosition: CGPoint) {
        self.position = newPosition
        self.homePosition = newPosition  // Update home when dropped
        self.targetPosition = nil  // Cancel any current movement
        // Don't change state if in attention mode
        if case .attentionNeeded = state {
            // Keep attention state
        } else {
            state = .sleeping  // Pause movement after drag
        }
        clampPosition()
        delegate?.roamingDidUpdatePosition(position)
    }

    func beginDragging() {
        isDragging = true
    }

    func endDragging(at position: CGPoint) {
        isDragging = false
        // Update screen bounds to the screen where cat was dropped
        updateScreenBoundsForPosition(position)
        setPosition(position)
    }

    /// Find which screen contains the position and update bounds
    private func updateScreenBoundsForPosition(_ position: CGPoint) {
        let catCenter = CGPoint(x: position.x + catSize.width / 2, y: position.y + catSize.height / 2)
        for screen in NSScreen.screens {
            if screen.frame.contains(catCenter) {
                screenBounds = screen.visibleFrame
                return
            }
        }
    }

    /// Interrupt roaming for attention state
    func triggerAttention(session: String?, title: String?) {
        state = .attentionNeeded(session: session, title: title)
        targetPosition = nil
    }

    /// Return to normal roaming
    func resetToIdle() {
        bouncePhase = 0  // Reset bounce animation
        delegate?.roamingDidUpdatePosition(position)  // Reset to actual position
        makeDecision(force: true)
    }

    // MARK: - Private Methods

    private func makeDecision(force: Bool = false) {
        guard !isDragging else { return }
        // Don't interrupt attention state (unless forced by resetToIdle)
        if !force, case .attentionNeeded = state { return }

        let random = Int.random(in: 0...100)

        // Walk probability based on activity level preference
        if random < prefs.walkProbability {
            // Walk somewhere
            targetPosition = randomPosition()
            updateDirectionToTarget()
            state = .walking(direction: direction)
        } else {
            // Sleep
            targetPosition = nil
            state = .sleeping
            // Wake up after a while
            DispatchQueue.main.asyncAfter(deadline: .now() + .random(in: 8...20)) { [weak self] in
                if case .sleeping = self?.state {
                    self?.makeDecision()  // Wake up and decide again (walk or sleep)
                }
            }
        }
    }

    private func updateMovement() {
        guard !isDragging else { return }
        switch state {
        case .walking:
            guard let target = targetPosition else {
                makeDecision()
                return
            }

            let dx = target.x - position.x
            let dy = target.y - position.y
            let distance = sqrt(dx * dx + dy * dy)

            // Reached target?
            if distance < 5 {
                position = target
                targetPosition = nil
                delegate?.roamingDidUpdatePosition(position)
                makeDecision()
                return
            }

            // Move toward target
            let delta: CGFloat = 1.0 / 60.0
            let moveX = (dx / distance) * walkSpeed * delta
            let moveY = (dy / distance) * walkSpeed * delta

            position.x += moveX
            position.y += moveY

            clampPosition()
            updateDirectionToTarget()
            delegate?.roamingDidUpdatePosition(position)

        case .attentionNeeded:
            // Bounce in place
            performAttentionBounce()

        default:
            break
        }
    }

    private var bouncePhase: CGFloat = 0

    private func performAttentionBounce() {
        guard let catType = CatType.find(byId: prefs.catType) else { return }

        switch catType.notificationMovement {
        case .side:
            bouncePhase += 0.15
            let bounceOffset = sin(bouncePhase) * 8
            let bouncedPosition = CGPoint(x: position.x + bounceOffset, y: position.y)
            delegate?.roamingDidUpdatePosition(bouncedPosition)
        case .none:
            break
        }
    }

    private func updateDirectionToTarget() {
        guard let target = targetPosition else { return }

        let newDirection: Direction = target.x > position.x ? .right : .left
        if newDirection != direction {
            direction = newDirection
            delegate?.roamingDidChangeDirection(direction)
        }
    }

    /// Random position within roaming radius of home (or full screen if radius is 0)
    private func randomPosition() -> CGPoint {
        let radius = prefs.roamingRadius

        // If radius is 0, roam anywhere on screen
        if radius == 0 {
            return randomScreenPosition()
        }

        // Pick a random point within radius of home
        let angle = CGFloat.random(in: 0...(2 * .pi))
        let distance = CGFloat.random(in: 0...radius)

        var newX = homePosition.x + cos(angle) * distance
        var newY = homePosition.y + sin(angle) * distance

        // Clamp to screen bounds
        let margin: CGFloat = 20
        newX = max(screenBounds.minX + margin, min(screenBounds.maxX - catSize.width - margin, newX))
        newY = max(screenBounds.minY + margin, min(screenBounds.maxY - catSize.height - margin, newY))

        return CGPoint(x: newX, y: newY)
    }

    /// Random position anywhere on screen (used for initial spawn)
    private func randomScreenPosition() -> CGPoint {
        let margin: CGFloat = 20
        return CGPoint(
            x: CGFloat.random(in: (screenBounds.minX + margin)...(screenBounds.maxX - catSize.width - margin)),
            y: CGFloat.random(in: (screenBounds.minY + margin)...(screenBounds.maxY - catSize.height - margin))
        )
    }

    private func clampPosition() {
        position.x = max(screenBounds.minX, min(screenBounds.maxX - catSize.width, position.x))
        position.y = max(screenBounds.minY, min(screenBounds.maxY - catSize.height, position.y))
    }
}
