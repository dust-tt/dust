import Foundation

extension Date {
    /// Create from Unix timestamp in milliseconds (as used by the Dust API)
    init(milliseconds: Int) {
        self.init(timeIntervalSince1970: TimeInterval(milliseconds) / 1000)
    }

    /// Format for conversation list grouping
    var conversationGroupLabel: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(self) {
            return "Today"
        } else if calendar.isDateInYesterday(self) {
            return "Yesterday"
        } else if calendar.isDate(self, equalTo: Date(), toGranularity: .weekOfYear) {
            return formatted(.dateTime.weekday(.wide))
        } else {
            return formatted(.dateTime.month(.abbreviated).day())
        }
    }
}
