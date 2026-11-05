package expo.modules.recordingcontrols

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * The SharedPreferences backed queue shared by the notification actions and the JS drain.
 * Records contain only the six contract fields; no journal content is ever written here.
 */
object RecordingIntentQueue {
  const val PREFS = "daytale_recording_controls"
  const val PENDING_KEY = "pending_recording_intents"
  const val ACTIVE_SESSION_KEY = "active_recording_session_id"
  const val MAX_RECORDS = 32

  // One process-wide lock so the read-modify-write of the JSON array cannot interleave.
  private val lock = Any()

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun setActiveSession(context: Context, sessionId: String?) {
    try {
      val editor = prefs(context).edit()
      if (sessionId.isNullOrEmpty()) {
        editor.remove(ACTIVE_SESSION_KEY)
      } else {
        editor.putString(ACTIVE_SESSION_KEY, sessionId)
      }
      editor.apply()
    } catch (_: Exception) {
    }
  }

  fun activeSession(context: Context): String? {
    return try {
      prefs(context).getString(ACTIVE_SESSION_KEY, null)?.takeIf { it.isNotEmpty() }
    } catch (_: Exception) {
      null
    }
  }

  fun append(
    context: Context,
    kind: String,
    source: String = "android-notification",
  ): Map<String, String>? {
    return synchronized(lock) {
      try {
        val sessionId = activeSession(context) ?: return@synchronized null
        val id = UUID.randomUUID().toString().lowercase(Locale.US)
        val createdAt = isoTimestamp()
        val record = JSONObject().apply {
          put("version", 1)
          put("id", id)
          put("kind", kind)
          put("sessionId", sessionId)
          put("createdAt", createdAt)
          put("source", source)
        }

        val records = readArray(context)
        var duplicate = false
        for (index in 0 until records.length()) {
          if (records.optJSONObject(index)?.optString("id") == id) {
            duplicate = true
            break
          }
        }

        if (!duplicate) {
          records.put(record)
          while (records.length() > MAX_RECORDS) {
            records.remove(0)
          }
          prefs(context).edit().putString(PENDING_KEY, records.toString()).apply()
        }

        mapOf(
          "version" to "1",
          "id" to id,
          "kind" to kind,
          "sessionId" to sessionId,
          "createdAt" to createdAt,
          "source" to source,
        )
      } catch (_: Exception) {
        null
      }
    }
  }

  fun read(context: Context): List<Map<String, Any>> {
    return synchronized(lock) {
      try {
        val records = readArray(context)
        val result = mutableListOf<Map<String, Any>>()
        for (index in 0 until records.length()) {
          val record = records.optJSONObject(index) ?: continue
          val values = mutableMapOf<String, Any>()
          val keys = record.keys()
          while (keys.hasNext()) {
            val key = keys.next()
            values[key] = record.get(key)
          }
          result.add(values)
        }
        result
      } catch (_: Exception) {
        emptyList()
      }
    }
  }

  fun remove(context: Context, ids: List<String>) {
    if (ids.isEmpty()) {
      return
    }
    synchronized(lock) {
      try {
        val removed = ids.toSet()
        val records = readArray(context)
        val remaining = JSONArray()
        for (index in 0 until records.length()) {
          val record = records.optJSONObject(index) ?: continue
          if (!removed.contains(record.optString("id"))) {
            remaining.put(record)
          }
        }
        prefs(context).edit().putString(PENDING_KEY, remaining.toString()).apply()
      } catch (_: Exception) {
      }
    }
  }

  private fun readArray(context: Context): JSONArray {
    val raw = prefs(context).getString(PENDING_KEY, null) ?: return JSONArray()
    return try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
  }

  private fun isoTimestamp(): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date())
  }
}
