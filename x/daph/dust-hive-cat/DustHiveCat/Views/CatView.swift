import Cocoa

protocol CatViewDelegate: AnyObject {
    func catViewWasClicked()
    func catViewWasRightClicked(at point: NSPoint)
    func catViewWasDragged(to position: NSPoint)
}

class CatView: NSView {
    weak var delegate: CatViewDelegate?

    private var imageView: NSImageView!
    private var isDragging = false
    private var dragOffset: NSPoint = .zero

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    private func setup() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor

        imageView = NSImageView(frame: bounds)
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.autoresizingMask = [.width, .height]
        addSubview(imageView)

        // Enable tracking for mouse events
        let trackingArea = NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .mouseEnteredAndExited, .mouseMoved],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea)
    }

    func updateImage(_ image: NSImage) {
        imageView.image = image
    }

    // MARK: - Mouse Events

    override func mouseDown(with event: NSEvent) {
        isDragging = false
        dragOffset = event.locationInWindow
    }

    override func mouseDragged(with event: NSEvent) {
        isDragging = true

        guard let window = self.window else { return }

        let currentLocation = NSEvent.mouseLocation
        let newOrigin = NSPoint(
            x: currentLocation.x - dragOffset.x,
            y: currentLocation.y - dragOffset.y
        )
        window.setFrameOrigin(newOrigin)
    }

    override func mouseUp(with event: NSEvent) {
        if !isDragging {
            // It was a click, not a drag
            delegate?.catViewWasClicked()
        } else {
            // Notify delegate of new position after drag
            if let windowOrigin = self.window?.frame.origin {
                delegate?.catViewWasDragged(to: windowOrigin)
            }
        }
        isDragging = false
    }

    override func rightMouseDown(with event: NSEvent) {
        delegate?.catViewWasRightClicked(at: event.locationInWindow)
    }

    // MARK: - Cursor

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    override func mouseEntered(with event: NSEvent) {
        NSCursor.pointingHand.set()
    }

    override func mouseExited(with event: NSEvent) {
        NSCursor.arrow.set()
    }
}
