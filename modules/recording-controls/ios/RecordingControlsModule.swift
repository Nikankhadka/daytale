import ActivityKit
import ExpoModulesCore
import Foundation

struct StartLiveActivityInput: Record {
  @Field(.required) var sessionId: String = ""
  @Field(.required) var status: String = ""
  @Field(.required) var startedAt: String = ""
  @Field(.required) var scheduledEnd: String = ""
}

struct UpdateLiveActivityInput: Record {
  @Field(.required) var status: String = ""
  @Field(.required) var updatedAt: String = ""
}

struct EndLiveActivityInput: Record {
  @Field(.required) var status: String = ""
}

public class RecordingControlsModule: Module {
  private var activity: Activity<RecordingActivityAttributes>?
  private var intentObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("DaytaleRecordingControls")
    Events("onRecordingIntent")

    Function("isLiveActivitySupported") { () -> Bool in
      if #available(iOS 17.0, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("setActiveSession") { (sessionId: String?) in
      RecordingIntentQueue.setActiveSessionId(sessionId)
    }

    AsyncFunction("startLiveActivity") { (input: StartLiveActivityInput, promise: Promise) in
      Task { @MainActor in
        guard #available(iOS 17.0, *) else {
          promise.resolve(false)
          return
        }
        let started = await self.start(input)
        promise.resolve(started)
      }
    }
    .runOnQueue(.main)

    AsyncFunction("updateLiveActivity") { (input: UpdateLiveActivityInput, promise: Promise) in
      Task { @MainActor in
        guard #available(iOS 17.0, *) else {
          promise.resolve(false)
          return
        }
        let updated = await self.update(input)
        promise.resolve(updated)
      }
    }
    .runOnQueue(.main)

    AsyncFunction("endLiveActivity") { (input: EndLiveActivityInput, promise: Promise) in
      Task { @MainActor in
        guard #available(iOS 17.0, *) else {
          promise.resolve()
          return
        }
        await self.end(input)
        promise.resolve()
      }
    }
    .runOnQueue(.main)

    AsyncFunction("readPendingIntents") { () -> [[String: Any]] in
      RecordingIntentQueue.read()
    }

    AsyncFunction("removePendingIntents") { (ids: [String]) in
      RecordingIntentQueue.remove(ids: ids)
    }

    AsyncFunction("showPausedNotification") { (_: String) in
      // iOS has no paused notification; the Live Activity is the paused surface.
    }

    AsyncFunction("hidePausedNotification") { () in
      // iOS has no paused notification to hide.
    }

    AsyncFunction("consumePendingResume") { () -> Bool in
      false
    }

    AsyncFunction("enqueueIntent") { (kind: String) in
      RecordingIntentQueue.append(kind: kind)
    }

    OnCreate {
      self.intentObserver = NotificationCenter.default.addObserver(
        forName: Notification.Name("daytaleRecordingIntent"),
        object: nil,
        queue: .main
      ) { [weak self] notification in
        guard let record = notification.object as? [String: Any] else {
          return
        }
        self?.sendEvent("onRecordingIntent", record)
      }
    }

    OnDestroy {
      if let observer = self.intentObserver {
        NotificationCenter.default.removeObserver(observer)
      }
      self.intentObserver = nil
      self.activity = nil
    }
  }

  @available(iOS 17.0, *)
  @MainActor
  private func start(_ input: StartLiveActivityInput) async -> Bool {
    for existing in Activity<RecordingActivityAttributes>.activities
    where existing.attributes.sessionId == input.sessionId {
      await existing.end(nil, dismissalPolicy: .immediate)
    }
    activity = nil

    let state = RecordingActivityAttributes.ContentState(
      status: input.status,
      startedAt: input.startedAt,
      updatedAt: input.startedAt,
      scheduledEnd: input.scheduledEnd
    )
    let content = ActivityContent(state: state, staleDate: parseDate(input.scheduledEnd))

    do {
      let requested = try Activity.request(
        attributes: RecordingActivityAttributes(sessionId: input.sessionId),
        content: content,
        pushType: nil
      )
      activity = requested
      return true
    } catch {
      return false
    }
  }

  @available(iOS 17.0, *)
  @MainActor
  private func update(_ input: UpdateLiveActivityInput) async -> Bool {
    guard
      let current = activity ?? Activity<RecordingActivityAttributes>.activities.first
    else {
      return false
    }

    let previous = current.content.state
    let state = RecordingActivityAttributes.ContentState(
      status: input.status,
      startedAt: previous.startedAt,
      updatedAt: input.updatedAt,
      scheduledEnd: previous.scheduledEnd
    )
    let content = ActivityContent(state: state, staleDate: parseDate(previous.scheduledEnd))
    await current.update(content)
    activity = current
    return true
  }

  @available(iOS 17.0, *)
  @MainActor
  private func end(_ input: EndLiveActivityInput) async {
    let policy: ActivityUIDismissalPolicy = input.status == "completed" ? .default : .immediate
    for current in Activity<RecordingActivityAttributes>.activities {
      await current.end(nil, dismissalPolicy: policy)
    }
    activity = nil
  }

  private func parseDate(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) {
      return date
    }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
  }
}
