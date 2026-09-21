package com.focusapp.foregroundwatcher
import android.app.Activity
import android.app.Application
import android.os.Bundle
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
class ForegroundWatcherModule(private val context:ReactApplicationContext):ReactContextBaseJavaModule(context),Application.ActivityLifecycleCallbacks{private var active=false;init{(context.applicationContext as Application).registerActivityLifecycleCallbacks(this)};override fun getName()="ForegroundWatcher";@ReactMethod fun startMonitoring(){active=true};@ReactMethod fun stopMonitoring(){active=false};@ReactMethod fun isMonitoring(p:Promise){p.resolve(active)};private fun emit(state:String){if(!active)return;val e=Arguments.createMap();e.putString("packageName",context.packageName);e.putString("state",state);e.putDouble("timestamp",System.currentTimeMillis().toDouble());context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("foregroundChanged",e)};override fun onActivityResumed(a:Activity)=emit("foreground");override fun onActivityPaused(a:Activity)=emit("background");override fun onActivityCreated(a:Activity,b:Bundle?){};override fun onActivityStarted(a:Activity){};override fun onActivityStopped(a:Activity){};override fun onActivitySaveInstanceState(a:Activity,b:Bundle){};override fun onActivityDestroyed(a:Activity){}}
