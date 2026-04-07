import SparkleTokens
import SwiftUI

struct DustLogoPiece: Identifiable {
    let id: Int
    let color: Color
    let path: (CGRect) -> Path
}

struct DustLogoPiecesView: View {
    static let pieceCount = 7
    static let colors: [Color] = [
        .green200, .rose200, .green600, .rose500, .blue500, .blue200, .golden500,
    ]

    var pieceOffsets: [CGSize]
    var pieceRotations: [Double]
    var pieceOpacity: Double

    var body: some View {
        GeometryReader { geo in
            let bounds = CGRect(origin: .zero, size: geo.size)
            ZStack {
                ForEach(Array(Self.pieces.enumerated()), id: \.element.id) { index, piece in
                    piece.path(bounds)
                        .fill(piece.color)
                        .offset(safeOffset(for: index))
                        .rotationEffect(.degrees(safeRotation(for: index)))
                        .opacity(pieceOpacity)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func safeOffset(for index: Int) -> CGSize {
        index < pieceOffsets.count ? pieceOffsets[index] : .zero
    }

    private func safeRotation(for index: Int) -> Double {
        index < pieceRotations.count ? pieceRotations[index] : 0
    }

    // MARK: - Piece definitions (48x48 coordinate space, scaled to bounds)

    private static let pieces = makePieces()

    private static func makePieces() -> [DustLogoPiece] {
        [
            greenYellowCircle,
            pinkCircle,
            darkGreenRect,
            redRect,
            blueBar,
            lightBlueQuarter,
            yellowRect,
        ]
    }

    // 0: Green-yellow circle, top-left, center (12,12) r=12
    private static let greenYellowCircle = DustLogoPiece(id: 0, color: .green200) { bounds in
        let scale = bounds.width / 48
        var path = Path()
        path.addEllipse(in: CGRect(x: 0, y: 0, width: 24 * scale, height: 24 * scale))
        return path
    }

    // 1: Pink circle, top-right, center (36,12) r=12
    private static let pinkCircle = DustLogoPiece(id: 1, color: .rose200) { bounds in
        let scale = bounds.width / 48
        var path = Path()
        path.addEllipse(in: CGRect(x: 24 * scale, y: 0, width: 24 * scale, height: 24 * scale))
        return path
    }

    // 2: Dark green rect (0,0)-(12,24)
    private static let darkGreenRect = DustLogoPiece(id: 2, color: .green600) { bounds in
        let scale = bounds.width / 48
        var path = Path()
        path.addRect(CGRect(x: 0, y: 0, width: 12 * scale, height: 24 * scale))
        return path
    }

    // 3: Red rect (24,0)-(48,12)
    private static let redRect = DustLogoPiece(id: 3, color: .rose500) { bounds in
        let scale = bounds.width / 48
        var path = Path()
        path.addRect(CGRect(x: 24 * scale, y: 0, width: 24 * scale, height: 12 * scale))
        return path
    }

    // 4: Blue bar - SVG: M12 36 C8.686 36, 6 33.314, 6 30 C6 26.686, 8.686 24, 12 24 H48 V36 H12 Z
    private static let blueBar = DustLogoPiece(id: 4, color: .blue500) { bounds in
        let scale = bounds.width / 48
        var path = Path()
        path.move(to: CGPoint(x: 12 * scale, y: 36 * scale))
        path.addCurve(
            to: CGPoint(x: 6 * scale, y: 30 * scale),
            control1: CGPoint(x: 8.686 * scale, y: 36 * scale),
            control2: CGPoint(x: 6 * scale, y: 33.314 * scale)
        )
        path.addCurve(
            to: CGPoint(x: 12 * scale, y: 24 * scale),
            control1: CGPoint(x: 6 * scale, y: 26.686 * scale),
            control2: CGPoint(x: 8.686 * scale, y: 24 * scale)
        )
        path.addLine(to: CGPoint(x: 48 * scale, y: 24 * scale))
        path.addLine(to: CGPoint(x: 48 * scale, y: 36 * scale))
        path.closeSubpath()
        return path
    }

    // 5: Light blue quarter circle, bottom-left
    // SVG: M0 48V36H12C15.314 36 18 38.686 18 42C18 45.314 15.314 48 12 48H0Z
    private static let lightBlueQuarter = DustLogoPiece(id: 5, color: .blue200) { bounds in
        let scale = bounds.width / 48
        var path = Path()
        path.move(to: CGPoint(x: 0, y: 48 * scale))
        path.addLine(to: CGPoint(x: 0, y: 36 * scale))
        path.addLine(to: CGPoint(x: 12 * scale, y: 36 * scale))
        path.addCurve(
            to: CGPoint(x: 18 * scale, y: 42 * scale),
            control1: CGPoint(x: 15.314 * scale, y: 36 * scale),
            control2: CGPoint(x: 18 * scale, y: 38.686 * scale)
        )
        path.addCurve(
            to: CGPoint(x: 12 * scale, y: 48 * scale),
            control1: CGPoint(x: 18 * scale, y: 45.314 * scale),
            control2: CGPoint(x: 15.314 * scale, y: 48 * scale)
        )
        path.closeSubpath()
        return path
    }

    // 6: Yellow rect (24,24)-(36,48)
    private static let yellowRect = DustLogoPiece(id: 6, color: .golden500) { bounds in
        let scale = bounds.width / 48
        var path = Path()
        path.addRect(CGRect(x: 24 * scale, y: 24 * scale, width: 12 * scale, height: 24 * scale))
        return path
    }
}
