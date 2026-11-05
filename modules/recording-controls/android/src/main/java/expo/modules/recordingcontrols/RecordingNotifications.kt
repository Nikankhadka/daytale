package expo.modules.recordingcontrols

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

/**
 * The plain paused-state notification. It is not a foreground service and never touches the
 * recorder; Resume opens the app and Stop writes an intent record through the receiver.
 */
object RecordingNotifications {
  const val PAUSED_ID = 2002
  const val CHANNEL_ID = "daytale_recording_controls"
  const val ACTION_PAUSE = "expo.modules.recordingcontrols.action.PAUSE"
  const val ACTION_STOP = "expo.modules.recordingcontrols.action.STOP"
  const val RESUME_EXTRA = "daytale.recordingAction"

  private const val RESUME_REQUEST_CODE = 2201
  private const val STOP_REQUEST_CODE = 2202

  // The session id is owned by the queue; the notification only needs the resume/stop actions.
  @Suppress("UNUSED_PARAMETER")
  fun showPaused(context: Context, sessionId: String) {
    try {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      ensureChannel(manager)

      val resumeIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?.apply {
          putExtra(RESUME_EXTRA, "resume")
          addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      val resumePendingIntent = resumeIntent?.let {
        PendingIntent.getActivity(
          context,
          RESUME_REQUEST_CODE,
          it,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      }

      val stopIntent = Intent(context, RecordingActionReceiver::class.java).apply {
        action = ACTION_STOP
        setPackage(context.packageName)
      }
      val stopPendingIntent = PendingIntent.getBroadcast(
        context,
        STOP_REQUEST_CODE,
        stopIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

      val builder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setContentTitle("Daytale")
        .setContentText("Recording paused")
        .setSmallIcon(android.R.drawable.ic_btn_speak_now)
        .setOngoing(true)
        .setSilent(true)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOnlyAlertOnce(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setShowWhen(false)

      if (resumePendingIntent != null) {
        builder
          .addAction(android.R.drawable.ic_media_play, "Resume", resumePendingIntent)
          .setContentIntent(resumePendingIntent)
      }
      builder.addAction(android.R.drawable.ic_delete, "Stop", stopPendingIntent)

      manager.notify(PAUSED_ID, builder.build())
    } catch (_: Exception) {
    }
  }

  fun hidePaused(context: Context) {
    try {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.cancel(PAUSED_ID)
    } catch (_: Exception) {
    }
  }

  private fun ensureChannel(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    if (manager.getNotificationChannel(CHANNEL_ID) != null) {
      return
    }
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Recording controls",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Shows when a voice journal recording is paused"
      setShowBadge(false)
      enableVibration(false)
      enableLights(false)
      setSound(null, null)
    }
    manager.createNotificationChannel(channel)
  }
}
