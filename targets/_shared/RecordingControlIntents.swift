import ActivityKit
import AppIntents
import Foundation

extension Notification.Name {
  static let daytaleRecordingIntent = Notification.Name("daytaleRecordingIntent")
}

/// Appends a pause record and wakes a live JS runtime. Never opens the app.
@available(iOS 17.0, *)
struct PauseRecordingIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Pause recording"
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    RecordingIntentQueue.append(kind: "pause")
    NotificationCenter.default.post(name: .daytaleRecordingIntent, object: nil)
    return .result()
  }
}

/// Appends a resume record. iOS cannot start capture without JS, so this opens the app.
@available(iOS 17.0, *)
struct ResumeRecordingIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Resume recording"
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    RecordingIntentQueue.append(kind: "resume")
    NotificationCenter.default.post(name: .daytaleRecordingIntent, object: nil)
    return .result()
  }
}

/// Appends a stop record and best-effort ends every activity. Never opens the app.
@available(iOS 17.0, *)
struct StopRecordingIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Stop recording"
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    RecordingIntentQueue.append(kind: "stop")
    NotificationCenter.default.post(name: .daytaleRecordingIntent, object: nil)
    for activity in Activity<RecordingActivityAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
    return .result()
  }
}
