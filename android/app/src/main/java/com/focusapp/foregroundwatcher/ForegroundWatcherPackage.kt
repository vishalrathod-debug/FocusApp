package com.focusapp.foregroundwatcher
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
class ForegroundWatcherPackage:ReactPackage{override fun createNativeModules(c:ReactApplicationContext):List<NativeModule> = listOf(ForegroundWatcherModule(c));override fun createViewManagers(c:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()}
