import SparkleTokens
import SwiftUI

class SnakeGameViewModel: ObservableObject {
    let gridSize = 10

    // swiftlint:disable:next identifier_name
    struct GridPosition: Equatable, Hashable {
        var col: Int
        var row: Int
    }

    enum Direction {
        // swiftlint:disable:next identifier_name
        case up, down, left, right

        var opposite: Direction {
            switch self {
            case .up: .down
            case .down: .up
            case .left: .right
            case .right: .left
            }
        }
    }

    @Published var snake: [GridPosition] = []
    @Published var direction = Direction.right
    @Published var food = GridPosition(col: 0, row: 0)
    @Published var score = 0
    @Published var isGameOver = false

    private var nextDirection = Direction.right
    private var timer: Timer?
    private let tickInterval: TimeInterval = 0.2

    deinit {
        timer?.invalidate()
    }

    func startGame() {
        let midRow = gridSize / 2
        snake = [
            GridPosition(col: 4, row: midRow),
            GridPosition(col: 3, row: midRow),
            GridPosition(col: 2, row: midRow),
        ]
        direction = .right
        nextDirection = .right
        score = 0
        isGameOver = false
        spawnFood()

        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: tickInterval, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    func stopGame() {
        timer?.invalidate()
        timer = nil
    }

    func changeDirection(_ newDirection: Direction) {
        guard newDirection != direction.opposite else { return }
        nextDirection = newDirection
    }

    func colorForSegment(_ index: Int) -> Color {
        let colors = DustLogoPiecesView.colors
        return colors[index % colors.count]
    }

    /// Precomputed snake position to segment index map for O(1) grid lookups.
    func snakeIndexMap() -> [GridPosition: Int] {
        Dictionary(uniqueKeysWithValues: snake.enumerated().map { ($0.element, $0.offset) })
    }

    private func tick() {
        guard !isGameOver else { return }

        direction = nextDirection
        let head = snake[0]

        let newHead = switch direction {
        case .up: GridPosition(col: head.col, row: head.row - 1)
        case .down: GridPosition(col: head.col, row: head.row + 1)
        case .left: GridPosition(col: head.col - 1, row: head.row)
        case .right: GridPosition(col: head.col + 1, row: head.row)
        }

        // Wall collision
        if newHead.col < 0 || newHead.col >= gridSize || newHead.row < 0 || newHead.row >= gridSize {
            endGame()
            return
        }

        // Self collision
        if snake.contains(newHead) {
            endGame()
            return
        }

        snake.insert(newHead, at: 0)

        if newHead == food {
            score += 1
            spawnFood()
        } else {
            snake.removeLast()
        }
    }

    private func spawnFood() {
        let occupied = Set(snake)
        let totalCells = gridSize * gridSize
        guard occupied.count < totalCells else { return }

        var candidate: GridPosition
        repeat {
            candidate = GridPosition(
                col: Int.random(in: 0 ..< gridSize),
                row: Int.random(in: 0 ..< gridSize)
            )
        } while occupied.contains(candidate)
        food = candidate
    }

    private func endGame() {
        isGameOver = true
        timer?.invalidate()
        timer = nil
    }
}
