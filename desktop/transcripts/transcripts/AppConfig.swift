import Foundation

struct AppConfig {
  // Set this to true for local development
  static let isDevelopment = true

  static var dustBaseURL: String {
    return isDevelopment
      ? "http://localhost:3000" : "https://dust.tt"
  }

  static var environment: String {
    return isDevelopment ? "Development" : "Production"
  }
}
