import Foundation

struct AppConfig {
  static let isDevelopment: Bool = {
    #if DEBUG
      return true
    #else
      return false
    #endif
  }()

  static var dustBaseURL: String {
    return isDevelopment
      ? "http://localhost:3000" : "https://dust.tt"
  }

  static var environment: String {
    return isDevelopment ? "Development" : "Production"
  }
}
