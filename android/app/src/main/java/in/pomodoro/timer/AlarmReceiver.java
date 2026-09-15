package in.pomodoro.timer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class AlarmReceiver extends BroadcastReceiver {
    public static final String ACTION_STOP = "in.pomodoro.timer.ACTION_STOP";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            context.stopService(new Intent(context, RingService.class));
            return;
        }

        if (!AlarmScheduler.ACTION_FIRE.equals(action)) return;

        AlarmScheduler.clearStoredAlarm(context);
        Intent serviceIntent = new Intent(context, RingService.class)
                .setAction(RingService.ACTION_RING);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }
}
