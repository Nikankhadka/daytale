import Foundation

/// The App Group backed queue shared by the app, the Live Activity, and the widget.
/// Records contain only the six contract fields; no journal content is ever written here.
enum RecordingIntentQueue {
  static let appGroup = "group.com.daytale.app"
  static let pendingKey = "daytale.pendingRecordingIntents"
  static let activeSessionKey = "daytale.activeRecordingSessionId"
  static let maxRecords = 32

  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroup)
  }

  static func setActiveSessionId(_ id: String?) {
    guard let defaults = defaults else {
      return
    }
    if let id = id, !id.isEmpty {
      defaults.set(id, forKey: activeSessionKey)
    } else {
      defaults.removeObject(forKey: activeSessionKey)
    }
  }

  static func activeSessionId() -> String? {
    guard let value = defaults?.string(forKey: activeSessionKey), !value.isEmpty else {
      return nil
    }
    return value
  }

  /// Appends one record and returns it so the caller can hand the exact payload to JS.
  /// Returns `nil` when there is no active session or nothing was written.
  @discardableResult
  static func append(kind: String) -> [String: Any]? {
    guard let defaults = defaults, let sessionId = activeSessionId() else {
      return nil
    }
    let record: [String: Any] = [
      "version": 1,
      "id": UUID().uuidString.lowercased(),
      "kind": kind,
      "sessionId": sessionId,
      "createdAt": isoTimestamp(),
      "source": "ios-activity",
    ]
    let id = record["id"] as? String

    var records = read()
    if let id = id, records.contains(where: { ($0["id"] as? String) == id }) {
      return nil
    }
    records.append(record)
    if records.count > maxRecords {
      records.removeFirst(records.count - maxRecords)
    }
    write(records, defaults: defaults)
    return record
  }

  static func read() -> [[String: Any]] {
    guard
      let raw = defaults?.string(forKey: pendingKey),
      let data = raw.data(using: .utf8),
      let records = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else {
      return []
    }
    return records
  }

  static func remove(ids: [String]) {
    guard !ids.isEmpty, let defaults = defaults else {
      return
    }
    let removed = Set(ids)
    let remaining = read().filter { record in
      guard let id = record["id"] as? String else {
        return true
      }
      return !removed.contains(id)
    }
    write(remaining, defaults: defaults)
  }

  private static func write(_ records: [[String: Any]], defaults: UserDefaults) {
    guard
      let data = try? JSONSerialization.data(withJSONObject: records),
      let json = String(data: data, encoding: .utf8)
    else {
      return
    }
    defaults.set(json, forKey: pendingKey)
  }

  private static func isoTimestamp() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    return formatter.string(from: Date())
  }
}
