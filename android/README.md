# Pomodoro 3D Android wrapper

This folder wraps the existing Pomodoro web UI in a small native Android app so the timer can use Android `AlarmManager` for a real alarm even when the app is minimized or the screen is locked.

## Native behavior

- Exact alarm is scheduled for the current Pomodoro finish time.
- Dragging the timer while it is running cancels/replaces the previous alarm automatically.
- The alarm uses `RTC_WAKEUP` + `setExactAndAllowWhileIdle`.
- At zero, a foreground alarm service plays a repeating old-telephone `tring-tring` sound using the Android alarm audio stream.
- The notification includes a **Stop** action.
- A saved future alarm is restored after a normal device reboot.
- The timer UI itself is copied from the repository root into the APK during the Gradle build, so the web/PWA and Android versions use the same interface.

## First run permissions

On Android 12 and newer, starting the timer may open **Alarms & reminders**. Allow Pomodoro 3D to schedule exact alarms. On Android 13 and newer, also allow notifications so the alarm notification and Stop action are visible.

## Build locally

Open the `android` folder in Android Studio and build the `app` module, or run Gradle 8.9 with Java 17:

```bash
gradle -p android assembleDebug
```

The APK is created at:

`android/app/build/outputs/apk/debug/app-debug.apk`

The repository also contains a GitHub Actions workflow that builds `Pomodoro-3D-Android` as an artifact when Android/web timer files change.

## Android limitation

Force-stopping the app from Android Settings disables its scheduled alarms until the app is opened again. Normal minimization, screen locking, and process suspension are supported by the native alarm layer.
