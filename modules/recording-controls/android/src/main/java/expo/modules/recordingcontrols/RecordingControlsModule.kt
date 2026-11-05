package expo.modules.recordingcontrols

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RecordingControlsModule : Module() {
  private var intentReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("DaytaleRecordingControls")
    Events("onRecordingIntent")

    Function("isLiveActivitySupported") { false }

    AsyncFunction("setActiveSession") { sessionId: String? ->
      val ctx = context()
      if (ctx != null) {
        RecordingIntentQueue.setActiveSession(ctx, sessionId)
      }
    }

    AsyncFunction("startLiveActivity") { _: Map<String, Any?> ->
      false
    }

    AsyncFunction("updateLiveActivity") { _: Map<String, Any?> ->
      false
    }

    AsyncFunction("endLiveActivity") { _: Map<String, Any?> ->
    }

    AsyncFunction("readPendingIntents") {
      context()?.let { RecordingIntentQueue.read(it) } ?: emptyList<Map<String, Any>>()
    }

    AsyncFunction("removePendingIntents") { ids: List<String> ->
      val ctx = context()
      if (ctx != null) {
        RecordingIntentQueue.remove(ctx, ids)
      }
    }

    AsyncFunction("showPausedNotification") { sessionId: String ->
      val ctx = context()
      if (ctx != null) {
        RecordingNotifications.showPaused(ctx, sessionId)
      }
    }

    AsyncFunction("hidePausedNotification") {
      val ctx = context()
      if (ctx != null) {
        RecordingNotifications.hidePaused(ctx)
      }
    }

    AsyncFunction("consumePendingResume") {
      try {
        val intent = appContext.currentActivity?.intent
        val action = intent?.getStringExtra(RecordingNotifications.RESUME_EXTRA)
        intent?.removeExtra(RecordingNotifications.RESUME_EXTRA)
        action == "resume"
      } catch (_: Exception) {
        false
      }
    }

    AsyncFunction("enqueueIntent") { kind: String ->
      val ctx = context()
      if (ctx != null) {
        RecordingIntentQueue.append(ctx, kind, "android-notification")
      }
    }

    OnCreate {
      try {
        val context = context() ?: return@OnCreate
        val receiver = object : BroadcastReceiver() {
          override fun onReceive(context: Context, intent: Intent) {
            try {
              val record = mutableMapOf<String, Any?>()
              intent.extras?.keySet()?.forEach { key ->
                record[key] = intent.extras?.getString(key)
              }
              this@RecordingControlsModule.sendEvent("onRecordingIntent", record)
            } catch (_: Exception) {
            }
          }
        }
        ContextCompat.registerReceiver(
          context,
          receiver,
          IntentFilter(RecordingControlsModule.ACTION_INTENT_ADDED),
          ContextCompat.RECEIVER_NOT_EXPORTED
        )
        intentReceiver = receiver
      } catch (_: Exception) {
      }
    }

    OnDestroy {
      try {
        val receiver = intentReceiver
        val context = context()
        if (receiver != null && context != null) {
          context.unregisterReceiver(receiver)
        }
      } catch (_: Exception) {
      }
      intentReceiver = null
    }
  }

  private fun context(): Context? = appContext.reactContext ?: appContext.currentActivity

  companion object {
    const val ACTION_INTENT_ADDED = "expo.modules.recordingcontrols.INTENT_ADDED"
  }
}
