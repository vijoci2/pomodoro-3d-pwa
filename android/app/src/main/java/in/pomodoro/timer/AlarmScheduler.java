package in.pomodoro.timer;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public final class AlarmScheduler {
    private static final String PREFS = "pomodoro_native";
    private static final String KEY_ALARM_AT = "alarm_at";
    public static final String ACTION_FIRE = "in.pomodoro.timer.ACTION_FIRE";
    private static final int REQUEST_CODE = 3011;

    private AlarmScheduler() {}

    private static PendingIntent alarmIntent(Context context) {
        Intent intent = new Intent(context, AlarmReceiver.class).setAction(ACTION_FIRE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags);
    }

    public static boolean schedule(Context context, long triggerAtMillis) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
            return false;
        }

        PendingIntent pendingIntent = alarmIntent(context);
        manager.cancel(pendingIntent);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        } else {
            manager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        }

        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(KEY_ALARM_AT, triggerAtMillis)
                .apply();
        return true;
    }

    public static void cancel(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager != null) manager.cancel(alarmIntent(context));
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_ALARM_AT)
                .apply();
    }

    public static long getScheduledAt(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getLong(KEY_ALARM_AT, 0L);
    }

    public static void clearStoredAlarm(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_ALARM_AT)
                .apply();
    }

    public static void rescheduleSaved(Context context) {
        long triggerAt = getScheduledAt(context);
        if (triggerAt > System.currentTimeMillis()) {
            schedule(context, triggerAt);
        } else if (triggerAt > 0L) {
            clearStoredAlarm(context);
        }
    }
}
