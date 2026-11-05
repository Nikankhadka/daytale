import ActivityKit

struct RecordingActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var status: String
    var startedAt: String
    var updatedAt: String
    var scheduledEnd: String
  }

  var sessionId: String
}
