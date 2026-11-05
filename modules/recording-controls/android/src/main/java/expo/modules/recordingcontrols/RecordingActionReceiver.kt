package expo.modules.recordingcontrols

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle

/**
 * Writes a content-free intent record for a notification action, then wakes a live JS runtime.
 * It never touches the recorder, the session database, or any notification.
 */
class RecordingActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      val kind = when (intent.action) {
        RecordingNotifications.ACTION_PAUSE -> "pause"
        RecordingNotifications.ACTION_STOP -> "stop"
        else -> return
      }
      val record = RecordingIntentQueue.append(context, kind) ?: return
      val extras = Bundle().apply {
        record.forEach { (key, value) -> putString(key, value) }
      }
      context.sendBroadcast(
        Intent(RecordingControlsModule.ACTION_INTENT_ADDED)
          .setPackage(context.packageName)
          .putExtras(extras)
      )
    } catch (_: Exception) {
    }
  }
}
