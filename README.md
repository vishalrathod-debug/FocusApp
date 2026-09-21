# FocusApp MVP

An offline-only React Native CLI Android focus timer. Sessions and settings are saved locally with AsyncStorage under `@focusapp/mvp/v1` (`{ version, sessions, settings }`). `SessionService` safely merges saved data with defaults as its simple migration mechanism.

## Windows setup

1. Install Node.js 22+, JDK 17, and Android Studio.
2. In Android Studio **SDK Manager**, install Android SDK Platform 37, Build Tools 37.0.0, and NDK 28.2.13676358.
3. In **Device Manager**, create and boot an Android emulator.
4. Set `ANDROID_HOME` to your SDK directory and add `%ANDROID_HOME%\platform-tools` to PATH.

## Run

```powershell
npm install
npm start
```

In a second PowerShell terminal:

```powershell
npm run android
```

## Hard Focus MVP

This MVP uses Activity lifecycle to detect leaving the app — it is simple and works on most devices; to later add robust detection (UsageStats) you will need to request PACKAGE_USAGE_STATS with Settings page flow.

It does not request UsageStats permission and sends no data off the device.
