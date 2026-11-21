package io.github.okaiquemota.volei3d;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Tela cheia de verdade: sem barra de status e sem barra de navegacao.
 *
 * Num jogo deitado as duas barras comem a borda onde moram o joystick e o
 * PULAR. Elas voltam por um instante quando se arrasta da borda (o modo
 * "transient"), que e' o padrao de jogo no Android.
 *
 * Reaplicado ao voltar o foco: o sistema devolve as barras quando o app sai
 * e volta, e sem isto o jogo reabriria com elas na tela.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        esconderBarras();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) esconderBarras();
    }

    private void esconderBarras() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controle =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controle.hide(WindowInsetsCompat.Type.systemBars());
        controle.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
