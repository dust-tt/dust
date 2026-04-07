import SparkleTokens
import SwiftUI

struct SnakeGameView: View {
    @StateObject private var viewModel = SnakeGameViewModel()
    let onDismiss: () -> Void

    private let cellSpacing: CGFloat = 2

    var body: some View {
        let snakeMap = viewModel.snakeIndexMap()

        VStack(spacing: 20) {
            Spacer()

            Text("Score: \(viewModel.score)")
                .sparkleCopyXl()
                .foregroundStyle(Color.dustForeground)

            gameGrid(snakeMap: snakeMap)
                .padding(.horizontal, 24)

            controlPad
                .padding(.top, 8)

            Button(action: onDismiss) {
                Text("Tap to dismiss")
                    .sparkleCopySm()
                    .foregroundStyle(Color.dustFaint)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.dustBackground)
        .onAppear {
            viewModel.startGame()
        }
        .onDisappear {
            viewModel.stopGame()
        }
        .overlay {
            if viewModel.isGameOver {
                gameOverOverlay
            }
        }
    }

    // MARK: - Game Grid

    private func gameGrid(snakeMap: [SnakeGameViewModel.GridPosition: Int]) -> some View {
        GeometryReader { geo in
            let totalSpacing = cellSpacing * CGFloat(viewModel.gridSize - 1)
            let cellSize = (min(geo.size.width, geo.size.height) - totalSpacing) / CGFloat(viewModel.gridSize)
            let gridSide = cellSize * CGFloat(viewModel.gridSize) + totalSpacing

            VStack(spacing: cellSpacing) {
                ForEach(0 ..< viewModel.gridSize, id: \.self) { row in
                    HStack(spacing: cellSpacing) {
                        ForEach(0 ..< viewModel.gridSize, id: \.self) { col in
                            cellView(col: col, row: row, size: cellSize, snakeMap: snakeMap)
                        }
                    }
                }
            }
            .frame(width: gridSide, height: gridSide)
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .gesture(
            DragGesture(minimumDistance: 20)
                .onEnded { value in
                    let deltaX = value.translation.width
                    let deltaY = value.translation.height
                    let direction: SnakeGameViewModel.Direction = if abs(deltaX) > abs(deltaY) {
                        deltaX > 0 ? .right : .left
                    } else {
                        deltaY > 0 ? .down : .up
                    }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    viewModel.changeDirection(direction)
                }
        )
    }

    @ViewBuilder
    private func cellView(
        col: Int, row: Int, size: CGFloat,
        snakeMap: [SnakeGameViewModel.GridPosition: Int]
    ) -> some View {
        let pos = SnakeGameViewModel.GridPosition(col: col, row: row)

        if let snakeIndex = snakeMap[pos] {
            RoundedRectangle(cornerRadius: 3)
                .fill(viewModel.colorForSegment(snakeIndex))
                .frame(width: size, height: size)
        } else if pos == viewModel.food {
            ZStack {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.dustMuted)
                    .frame(width: size, height: size)
                SparkleIcon.sparkles.image
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: size * 0.7, height: size * 0.7)
                    .foregroundStyle(Color.golden500)
            }
        } else {
            RoundedRectangle(cornerRadius: 3)
                .fill(Color.dustMuted)
                .frame(width: size, height: size)
        }
    }

    // MARK: - D-Pad Controls

    private var controlPad: some View {
        VStack(spacing: 8) {
            directionButton(.up, icon: .chevronUp)
            HStack(spacing: 32) {
                directionButton(.left, icon: .chevronLeft)
                directionButton(.down, icon: .chevronDown)
                directionButton(.right, icon: .chevronRight)
            }
        }
    }

    private func directionButton(_ direction: SnakeGameViewModel.Direction, icon: SparkleIcon) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            viewModel.changeDirection(direction)
        } label: {
            icon.image
                .resizable()
                .frame(width: 28, height: 28)
                .foregroundStyle(Color.dustForeground)
                .padding(14)
                .background(Color.dustMuted)
                .clipShape(Circle())
        }
    }

    // MARK: - Game Over

    private var gameOverOverlay: some View {
        ZStack {
            Color.dustBackground.opacity(0.8)

            VStack(spacing: 16) {
                Text("Game Over")
                    .sparkleCopyXl()
                    .foregroundStyle(Color.dustForeground)

                Text("Score: \(viewModel.score)")
                    .sparkleCopyLg()
                    .foregroundStyle(Color.dustFaint)

                HStack(spacing: 16) {
                    Button {
                        viewModel.startGame()
                    } label: {
                        Text("Play Again")
                            .sparkleCopySm()
                            .foregroundStyle(Color.dustBackground)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Color.dustForeground)
                            .clipShape(Capsule())
                    }

                    Button(action: onDismiss) {
                        Text("Close")
                            .sparkleCopySm()
                            .foregroundStyle(Color.dustForeground)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Color.dustMuted)
                            .clipShape(Capsule())
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
