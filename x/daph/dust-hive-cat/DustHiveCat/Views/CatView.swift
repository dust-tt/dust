import Cocoa

protocol CatViewDelegate: AnyObject {
    func catViewWasClicked()
    func catViewWasDragged(to position: NSPoint)
    func catViewDragDidBegin()
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
        imageView.isEditable = false
        imageView.unregisterDraggedTypes()  // Disable drag handling
        addSubview(imageView)

        // Enable tracking for mouse events
        let trackingArea = NSTrackingArea(
            rect: bounds,
            options: [.activeAlways, .mouseEnteredAndExited, .mouseMoved, .cursorUpdate, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea)
    }

    // Ensure this view handles all mouse events, not the imageView
    override func hitTest(_ point: NSPoint) -> NSView? {
        return bounds.contains(point) ? self : nil
    }

    override func mouseMoved(with event: NSEvent) {
        NSCursor.pointingHand.set()
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
        if !isDragging {
            isDragging = true
            delegate?.catViewDragDidBegin()
        }

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

    // Consume right-click events to prevent context menus
    override func rightMouseDown(with event: NSEvent) {
        // Do nothing - just consume the event
    }

    override func rightMouseUp(with event: NSEvent) {
        // Do nothing - just consume the event
    }

    // Prevent any context menu from appearing
    override func menu(for event: NSEvent) -> NSMenu? {
        return nil
    }

    // MARK: - Cursor

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    override func cursorUpdate(with event: NSEvent) {
        NSCursor.pointingHand.set()
    }

    override func mouseEntered(with event: NSEvent) {
        NSCursor.pointingHand.push()
    }

    override func mouseExited(with event: NSEvent) {
        NSCursor.pop()
    }
}
