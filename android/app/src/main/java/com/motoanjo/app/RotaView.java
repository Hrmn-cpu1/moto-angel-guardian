package com.motoanjo.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/**
 * Desenho barato do traçado da viagem (P0.1c).
 *
 * POR QUE NÃO UM SEGUNDO GOOGLE MAP
 * Subir um MapView (ou uma segunda WebView com o mapa) só para a tela de
 * bloqueio duplicaria tiles, marcadores e loops de atualização — exatamente o
 * consumo que derrubou o WebView neste projeto uma vez. Aqui o traçado já
 * chega decodificado do app; a View só projeta os pontos na área disponível e
 * desenha uma polilinha. Sem rede, sem tiles, sem cache.
 *
 * O que ela mostra é o TRAÇADO REAL da rota calculada e a posição REAL vinda
 * do serviço. Nada é simulado: sem pontos, ela não desenha nada.
 */
public class RotaView extends View {

    private final Paint contorno = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint traco = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ponto = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint halo = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path caminho = new Path();

    private double[] rota = new double[0];
    private double lat = 0d;
    private double lng = 0d;
    private boolean temPosicao = false;

    public RotaView(Context c) {
        super(c);
        contorno.setStyle(Paint.Style.STROKE);
        contorno.setColor(Color.parseColor("#050505"));
        contorno.setStrokeWidth(14f);
        contorno.setStrokeCap(Paint.Cap.ROUND);
        contorno.setStrokeJoin(Paint.Join.ROUND);

        traco.setStyle(Paint.Style.STROKE);
        traco.setColor(Color.parseColor("#D4AF37"));
        traco.setStrokeWidth(8f);
        traco.setStrokeCap(Paint.Cap.ROUND);
        traco.setStrokeJoin(Paint.Join.ROUND);

        ponto.setColor(Color.parseColor("#D4AF37"));
        halo.setColor(Color.parseColor("#33D4AF37"));
    }

    /** Um quadro por atualização do app (~1 Hz). Nenhum loop próprio aqui. */
    public void atualizar(double[] novaRota, double novaLat, double novaLng, boolean posicaoValida) {
        rota = novaRota == null ? new double[0] : novaRota;
        lat = novaLat;
        lng = novaLng;
        temPosicao = posicaoValida;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        final int n = rota.length / 2;
        if (n == 0 && !temPosicao) return;

        double minLat = Double.MAX_VALUE, maxLat = -Double.MAX_VALUE;
        double minLng = Double.MAX_VALUE, maxLng = -Double.MAX_VALUE;
        for (int i = 0; i < n; i++) {
            minLat = Math.min(minLat, rota[i * 2]);
            maxLat = Math.max(maxLat, rota[i * 2]);
            minLng = Math.min(minLng, rota[i * 2 + 1]);
            maxLng = Math.max(maxLng, rota[i * 2 + 1]);
        }
        if (temPosicao) {
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
        }

        // Área degenerada (um ponto só): abre uma janela mínima para não dividir
        // por zero nem desenhar tudo num pixel.
        final double margemGrau = 0.0008d;
        if (maxLat - minLat < margemGrau) {
            minLat -= margemGrau;
            maxLat += margemGrau;
        }
        if (maxLng - minLng < margemGrau) {
            minLng -= margemGrau;
            maxLng += margemGrau;
        }

        final float pad = 24f;
        final float w = getWidth() - pad * 2;
        final float h = getHeight() - pad * 2;
        if (w <= 0 || h <= 0) return;

        final double escalaX = w / (maxLng - minLng);
        final double escalaY = h / (maxLat - minLat);
        final double escala = Math.min(escalaX, escalaY);
        final float deslocX = (float) (pad + (w - (maxLng - minLng) * escala) / 2);
        final float deslocY = (float) (pad + (h - (maxLat - minLat) * escala) / 2);

        caminho.reset();
        for (int i = 0; i < n; i++) {
            final float x = (float) (deslocX + (rota[i * 2 + 1] - minLng) * escala);
            // Latitude cresce para o norte; a tela cresce para baixo.
            final float y = (float) (deslocY + (maxLat - rota[i * 2]) * escala);
            if (i == 0) caminho.moveTo(x, y);
            else caminho.lineTo(x, y);
        }
        if (n >= 2) {
            canvas.drawPath(caminho, contorno);
            canvas.drawPath(caminho, traco);
        }

        if (temPosicao) {
            final float x = (float) (deslocX + (lng - minLng) * escala);
            final float y = (float) (deslocY + (maxLat - lat) * escala);
            canvas.drawCircle(x, y, 22f, halo);
            canvas.drawCircle(x, y, 10f, ponto);
        }
    }
}
