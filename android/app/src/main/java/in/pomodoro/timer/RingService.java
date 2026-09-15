package in.pomodoro.timer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

public class RingService extends Service {
    public static final String ACTION_RING = "in.pomodoro.timer.ACTION_RING";
    private static final String CHANNEL_ID = "pomodoro_alarm";
    private static final int NOTIFICATION_ID = 3012;
    private static final int SAMPLE_RATE = 44100;

    private volatile boolean ringing = false;
    private Thread ringThread;
    private AudioTrack audioTrack;
    private PowerManager.WakeLock wakeLock;
    private Vibrator vibrator;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification());
        startRinging();
        return START_NOT_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Pomodoro alarm",
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Rings when the Pomodoro reaches zero");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int immutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent openPending = PendingIntent.getActivity(
                this, 3013, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | immutable);

        Intent stopIntent = new Intent(this, AlarmReceiver.class)
                .setAction(AlarmReceiver.ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getBroadcast(
                this, 3014, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT | immutable);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        return builder
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("Pomodoro finished")
                .setContentText("Tring tring — time is up")
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_MAX)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setContentIntent(openPending)
                .addAction(android.R.drawable.ic_media_pause, "Stop", stopPending)
                .build();
    }

    private void startRinging() {
        if (ringing) return;
        ringing = true;

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Pomodoro3D:AlarmRing");
            wakeLock.acquire(35_000L);
        }

        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator != null && vibrator.hasVibrator()) {
            long[] pattern = {0, 350, 140, 350, 1000};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                //noinspection deprecation
                vibrator.vibrate(pattern, 0);
            }
        }

        ringThread = new Thread(() -> {
            try {
                short[] tring = makeTelephoneBell(380);
                int minBuffer = AudioTrack.getMinBufferSize(
                        SAMPLE_RATE,
                        AudioFormat.CHANNEL_OUT_MONO,
                        AudioFormat.ENCODING_PCM_16BIT);
                int bufferSize = Math.max(minBuffer, tring.length * 2);

                AudioAttributes attributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                AudioFormat format = new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build();

                audioTrack = new AudioTrack(
                        attributes,
                        format,
                        bufferSize,
                        AudioTrack.MODE_STREAM,
                        AudioTrack.AUDIO_SESSION_ID_GENERATE);
                audioTrack.play();

                long started = System.currentTimeMillis();
                while (ringing && System.currentTimeMillis() - started < 30_000L) {
                    audioTrack.write(tring, 0, tring.length, AudioTrack.WRITE_BLOCKING);
                    if (!sleepWhileRinging(140)) break;
                    audioTrack.write(tring, 0, tring.length, AudioTrack.WRITE_BLOCKING);
                    if (!sleepWhileRinging(1000)) break;
                }
            } catch (Exception ignored) {
            } finally {
                stopSelf();
            }
        }, "PomodoroTelephoneRing");
        ringThread.start();
    }

    private boolean sleepWhileRinging(long millis) {
        long until = System.currentTimeMillis() + millis;
        while (ringing && System.currentTimeMillis() < until) {
            try {
                Thread.sleep(Math.min(40L, until - System.currentTimeMillis()));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return ringing;
    }

    private short[] makeTelephoneBell(int durationMs) {
        int count = SAMPLE_RATE * durationMs / 1000;
        short[] samples = new short[count];
        for (int i = 0; i < count; i++) {
            double t = (double) i / SAMPLE_RATE;
            double attack = Math.min(1.0, t / 0.012);
            double releaseStart = durationMs / 1000.0 - 0.08;
            double release = t < releaseStart ? 1.0 : Math.max(0.0, (durationMs / 1000.0 - t) / 0.08);
            double tremolo = 0.78 + 0.22 * Math.sin(2.0 * Math.PI * 18.0 * t);
            double metallic =
                    Math.sin(2.0 * Math.PI * 440.0 * t) +
                    0.88 * Math.sin(2.0 * Math.PI * 480.0 * t) +
                    0.23 * Math.sin(2.0 * Math.PI * 1320.0 * t) +
                    0.18 * Math.sin(2.0 * Math.PI * 1440.0 * t);
            double value = metallic * 0.18 * attack * release * tremolo;
            samples[i] = (short) (Math.max(-1.0, Math.min(1.0, value)) * Short.MAX_VALUE);
        }
        return samples;
    }

    @Override
    public void onDestroy() {
        ringing = false;
        if (ringThread != null) ringThread.interrupt();
        if (vibrator != null) vibrator.cancel();
        if (audioTrack != null) {
            try { audioTrack.stop(); } catch (Exception ignored) {}
            try { audioTrack.release(); } catch (Exception ignored) {}
            audioTrack = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
