package in.pomodoro.timer;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 7001;
    private WebView webView;
    private long lastExactPermissionPromptAt = 0L;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 12, 22));
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        webView.addJavascriptInterface(new PomodoroBridge(), "AndroidPomodoro");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");

        requestNotificationPermissionIfNeeded();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.postDelayed(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('android-alarm-permission-changed'));",
                    null), 250);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    private boolean canScheduleExactAlarms() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager manager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        return manager != null && manager.canScheduleExactAlarms();
    }

    private void requestExactAlarmPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || canScheduleExactAlarms()) return;
        long now = System.currentTimeMillis();
        if (now - lastExactPermissionPromptAt < 2500L) return;
        lastExactPermissionPromptAt = now;

        runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } catch (Exception ignored) {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            }
        });
    }

    public final class PomodoroBridge {
        @JavascriptInterface
        public boolean scheduleAlarm(long triggerAtMillis) {
            if (!canScheduleExactAlarms()) {
                requestExactAlarmPermission();
                return false;
            }
            return AlarmScheduler.schedule(MainActivity.this, triggerAtMillis);
        }

        @JavascriptInterface
        public void cancelAlarm() {
            AlarmScheduler.cancel(MainActivity.this);
        }

        @JavascriptInterface
        public void stopAlarm() {
            AlarmScheduler.cancel(MainActivity.this);
            stopService(new Intent(MainActivity.this, RingService.class));
        }

        @JavascriptInterface
        public boolean isExactAlarmAllowed() {
            return canScheduleExactAlarms();
        }
    }
}
