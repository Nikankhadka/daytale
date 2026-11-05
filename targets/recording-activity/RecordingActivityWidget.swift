import ActivityKit
import SwiftUI
import WidgetKit

struct RecordingActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RecordingActivityAttributes.self) { context in
      VStack(spacing: 4) {
        Text("Daytale")
        Text(context.state.status == "paused" ? "Paused" : "Recording")
      }
      .activityBackgroundTint(.black)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.center) {
          Text(context.state.status == "paused" ? "Paused" : "Recording")
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

@main
struct RecordingActivityWidgetBundle: WidgetBundle {
  var body: some Widget {
    RecordingActivityWidget()
  }
}
