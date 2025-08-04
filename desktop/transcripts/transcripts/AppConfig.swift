import Foundation

struct AppConfig {
    // Set this to true for local development
    static let isDevelopment = true
    
    static var dustBaseURL: String {
        return isDevelopment ? "http://localhost:3000/api/v1" : "https://dust.tt/api/v1"
    }
    
    static var environment: String {
        return isDevelopment ? "Development" : "Production"
    }
}