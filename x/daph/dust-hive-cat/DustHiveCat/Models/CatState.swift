import Foundation

enum CatState: Equatable {
    case idle
    case walking(direction: Direction)
    case sleeping
    case attentionNeeded(session: String?, title: String?)

    static func == (lhs: CatState, rhs: CatState) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle): return true
        case (.sleeping, .sleeping): return true
        case (.walking(let d1), .walking(let d2)): return d1 == d2
        case (.attentionNeeded(let s1, _), .attentionNeeded(let s2, _)): return s1 == s2
        default: return false
        }
    }
}

enum Direction: Equatable {
    case left
    case right
}

enum AnimationType: String, CaseIterable {
    case walk = "walk"
    case notification = "notification"
    case sleep = "sleep"
}

enum NotificationMovement {
    case none
    case side
}

struct CatType: Identifiable, Hashable {
    let id: String
    let displayName: String
    let notificationMovement: NotificationMovement

    static func == (lhs: CatType, rhs: CatType) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static let allCats: [CatType] = [
        CatType(id: "soupinou", displayName: "Soupinou", notificationMovement: .side),
        CatType(id: "chawy", displayName: "Chawy", notificationMovement: .side),
        CatType(id: "shiba", displayName: "Pistache", notificationMovement: .none),
        CatType(id: "chalom", displayName: "Chalom", notificationMovement: .side),
        CatType(id: "sundae", displayName: "Sundae", notificationMovement: .none),
    ]

    static let `default` = CatType(id: "soupinou", displayName: "Soupinou", notificationMovement: .side)

    static func find(byId id: String) -> CatType? {
        allCats.first { $0.id == id }
    }
}
