package com.jonassprocatti.knoweb;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.CookieManager;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.CapConfig;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/**
 * Resumo diário no app Android. A WebView não recebe Web Push, então um alarme
 * por volta das 8h busca /api/notifications com a sessão da WebView (cookies)
 * e mostra a notificação. Sem Firebase.
 */
public class DigestReceiver extends BroadcastReceiver {
    private static final String CHANNEL = "resumo";

    /** Agenda (ou reagenda) o alarme diário. Chamado ao abrir o app e quando o celular liga. */
    public static void schedule(Context ctx) {
        Calendar at = Calendar.getInstance();
        at.set(Calendar.HOUR_OF_DAY, 8);
        at.set(Calendar.MINUTE, 0);
        at.set(Calendar.SECOND, 0);
        if (at.getTimeInMillis() < System.currentTimeMillis()) at.add(Calendar.DAY_OF_YEAR, 1);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, new Intent(ctx, DigestReceiver.class), PendingIntent.FLAG_IMMUTABLE);
        ctx.getSystemService(AlarmManager.class)
            .setInexactRepeating(AlarmManager.RTC_WAKEUP, at.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            schedule(ctx);
            return;
        }
        PendingResult done = goAsync();
        new Thread(() -> {
            try {
                fetchAndNotify(ctx);
            } catch (Exception ignored) {
                // Sem rede ou sem login: tenta de novo amanhã
            } finally {
                done.finish();
            }
        }).start();
    }

    private void fetchAndNotify(Context ctx) throws Exception {
        String base = CapConfig.loadDefault(ctx).getServerUrl();
        if (base == null) return;
        CookieManager cookies = CookieManager.getInstance();
        HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/notifications").openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        String cookie = cookies.getCookie(base);
        if (cookie == null) return;
        c.setRequestProperty("Cookie", cookie);
        int status = c.getResponseCode();
        // O servidor pode renovar a sessão: guarda os cookies novos, senão a WebView fica deslogada
        for (Map.Entry<String, List<String>> h : c.getHeaderFields().entrySet()) {
            if (h.getKey() != null && h.getKey().equalsIgnoreCase("Set-Cookie"))
                for (String v : h.getValue()) cookies.setCookie(base, v);
        }
        cookies.flush();
        if (status != 200) return;
        ByteArrayOutputStream text = new ByteArrayOutputStream();
        try (InputStream in = c.getInputStream()) {
            byte[] buf = new byte[4096];
            for (int n; (n = in.read(buf)) > 0; ) text.write(buf, 0, n);
        }
        JSONObject digest = new JSONObject(text.toString("UTF-8")).optJSONObject("digest");
        if (digest == null) return;
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;

        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Resumo diário", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(base + digest.optString("url", "/")), ctx, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        String body = digest.optString("body");
        nm.notify(2, new NotificationCompat.Builder(ctx, CHANNEL)
            .setContentTitle(digest.optString("title", "Knoweb"))
            .setContentText(body.split("\n")[0])
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentIntent(PendingIntent.getActivity(ctx, 1, open, PendingIntent.FLAG_IMMUTABLE))
            .setAutoCancel(true)
            .build());
    }
}
