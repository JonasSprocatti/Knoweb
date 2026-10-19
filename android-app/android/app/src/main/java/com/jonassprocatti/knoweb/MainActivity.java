package com.jonassprocatti.knoweb;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RecordingPlugin.class);
        super.onCreate(savedInstanceState);
        // Resumo diário: pede a permissão de notificação uma vez e agenda o alarme das 8h
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.POST_NOTIFICATIONS }, 2);
        }
        DigestReceiver.schedule(this);
        openLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openLink(intent);
    }

    /** Toque na notificação: abre a tela dela (ex.: /tasks) dentro do app. */
    private void openLink(Intent intent) {
        Uri link = intent.getData();
        String base = bridge.getConfig().getServerUrl();
        if (link == null || base == null || !link.toString().startsWith(base)) return;
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(link.toString()));
    }
}
