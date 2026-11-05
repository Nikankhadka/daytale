import ActivityKit
import SwiftUI
import WidgetKit

struct RecordingActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RecordingActivityAttributes.self) { context in
      RecordingLockScreenView(context: context)
        .activityBackgroundTint(.black)
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 6) {
            RecordingStatusView(status: context.state.status, startedAt: context.state.startedAt)
            RecordingActionButtons(status: context.state.status)
          }
        }
      } compactLeading: {
        Image(systemName: "mic.fill")
      } compactTrailing: {
        Image(systemName: "mic.fill")
      } minimal: {
        Image(systemName: "mic.fill")
      }
    }
  }
}

private struct RecordingLockScreenView: View {
  let context: ActivityViewContext<RecordingActivityAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Daytale")
        .font(.caption)
        .foregroundStyle(.secondary)
      HStack(alignment: .center, spacing: 12) {
        RecordingStatusView(status: context.state.status, startedAt: context.state.startedAt)
        Spacer(minLength: 0)
        RecordingActionButtons(status: context.state.status)
      }
    }
    .padding()
  }
}

private struct RecordingStatusView: View {
  let status: String
  let startedAt: String

  private var title: String {
    status == "paused" ? "Paused" : "Recording"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(title)
        .font(.headline)
      if let start = RecordingStatusView.parse(startedAt) {
        Text(start, style: .timer)
          .font(.subheadline)
          .monospacedDigit()
      }
    }
  }

  private static func parse(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) {
      return date
    }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
  }
}

private struct RecordingActionButtons: View {
  let status: String

  var body: some View {
    HStack(spacing: 8) {
      if status == "paused" {
        Button(intent: ResumeRecordingIntent()) {
          Label("Resume", systemImage: "play.fill")
        }
        .accessibilityLabel("Resume recording")
      } else {
        Button(intent: PauseRecordingIntent()) {
          Label("Pause", systemImage: "pause.fill")
        }
        .accessibilityLabel("Pause recording")
      }
      Button(intent: StopRecordingIntent()) {
        Label("Stop", systemImage: "stop.fill")
      }
      .accessibilityLabel("Stop recording")
    }
    .buttonStyle(.bordered)
  }
}

@main
struct RecordingActivityWidgetBundle: WidgetBundle {
  var body: some Widget {
    RecordingActivityWidget()
  }
}
