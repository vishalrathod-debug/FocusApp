package com.focusapp.usage

import android.app.AppOpsManager
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.os.Process
import android.provider.Settings
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

class AppUsageStatsModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AppUsageStats"

  @ReactMethod
  fun isUsageAccessEnabled(promise: Promise) {
    promise.resolve(hasUsageAccess())
  }

  @ReactMethod
  fun openUsageAccessSettings() {
    val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactContext.startActivity(intent)
  }

  @ReactMethod
  fun getAppUsage(promise: Promise) {
    try {
      val entries = getUsageStatsForLastDay()
        .filter { it.totalTimeInForeground > 0 }
        .groupBy { it.packageName }
        .map { (_, usageStats) ->
          val usageStat = usageStats.maxByOrNull { it.totalTimeInForeground } ?: return@map null
          val label = resolveAppName(usageStat.packageName)
          val icon = resolveAppIcon(usageStat.packageName)
          val totalMs = usageStats.sumOf { it.totalTimeInForeground }
          val map = Arguments.createMap()
          map.putString("name", label)
          map.putString("packageName", usageStat.packageName)
          map.putString("icon", icon)
          map.putDouble("totalMs", totalMs.toDouble())
          map
        }
        .filterNotNull()
        .sortedByDescending { it.getDouble("totalMs") }
        .take(12)

      val result = Arguments.createArray()
      for (entry in entries) {
        result.pushMap(entry)
      }

      promise.resolve(result)
    } catch (exception: Exception) {
      promise.resolve(Arguments.createArray())
    }
  }

  private fun hasUsageAccess(): Boolean {
    val appOps = reactContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.checkOpNoThrow(
      AppOpsManager.OPSTR_GET_USAGE_STATS,
      Process.myUid(),
      reactContext.packageName,
    )
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun getUsageStatsForLastDay(): List<UsageStats> {
    val usageStatsManager = reactContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val now = System.currentTimeMillis()
    val start = now - TimeUnit.DAYS.toMillis(1)
    return usageStatsManager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, now)
      ?.filterNotNull()
      ?: emptyList()
  }

  private fun resolveAppName(packageName: String): String {
    return try {
      val appInfo = reactContext.packageManager.getApplicationInfo(packageName, 0)
      reactContext.packageManager.getApplicationLabel(appInfo)?.toString() ?: packageName
    } catch (_: PackageManager.NameNotFoundException) {
      packageName
    }
  }

  private fun resolveAppIcon(packageName: String): String {
    return try {
      val drawable = reactContext.packageManager.getApplicationIcon(packageName)
      val bitmap = (drawable as? BitmapDrawable)?.bitmap ?: run {
        val bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bitmap)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        bitmap
      }

      val outputStream = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
      val byteArray = outputStream.toByteArray()
      "data:image/png;base64,${Base64.encodeToString(byteArray, Base64.NO_WRAP)}"
    } catch (_: Exception) {
      ""
    }
  }
}
