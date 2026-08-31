package com.motoanjo.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Mapa real na tela de bloqueio (P0.1c — Fase B).
 *
 * POR QUE ASSIM, E NÃO COM O SDK DO GOOGLE MAPS
 * O SDK Android do Google Maps exige duas coisas que este projeto NÃO tem:
 * a dependência `play-services-maps` e uma chave de API restrita ao Android
 * (pacote + impressão SHA-1 da assinatura). A chave que existe hoje é a chave
 * de navegador do conector, restrita por referrer a *.lovable.app — o SDK
 * nativo é recusado por ela. Enquanto essa chave Android não existir, subir o
 * SDK entregaria um mapa cinza com "authorization failure".
 *
 * Então o mapa é desenhado aqui: tiles raster XYZ padrão, sem SDK, sem chave e
 * sem segunda WebView. Câmera segue a posição que o SERVIÇO já produz; rota,
 * manobra e ETA continuam vindo prontas do app. Nada é recalculado.
 *
 * DEGRADAÇÃO (Fase C)
 * Sem rede, ou antes do primeiro tile chegar, a View cai no desenho
 * simplificado herdado de {@link RotaView}: fundo escuro + traçado + posição.
 * A tela nunca fica vazia.
 */
public class MapaTilesView extends RotaView {

    /** Zoom de navegação urbana: rua legível sem virar mapa de bairro. */
    private static final int ZOOM = 16;
    private static final int TILE = 256;
    private static final String TEMPLATE = "https://tile.openstreetmap.org/%d/%d/%d.png";
    /** Exigido pela política de uso dos tiles: identificação honesta do app. */
    private static final String AGENTE = "MotoAnjo/1.3 (Android; lock-screen navigation)";

    private final LruCache<String, Bitmap> memoria = new LruCache<>(48);
    private final Set<String> baixando = new HashSet<>();
    private final ExecutorService trabalhadores = Executors.newFixedThreadPool(2);
    private final Handler principal = new Handler(Looper.getMainLooper());

    private final Paint pinturaTile = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint contornoRota = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint tracoRota = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint marcador = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint auraMarcador = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path caminhoRota = new Path();

    private boolean mapaPronto = false;
    private boolean desligado = false;

    public MapaTilesView(Context c) {
        super(c);

        // Tiles claros num cockpit noturno cegam quem pilota. Dessatura e
        // escurece — mesma leitura do mapa do app.
        final ColorMatrix m = new ColorMatrix();
        m.setSaturation(0.35f);
        final ColorMatrix escurecer = new ColorMatrix(new float[] {
            0.62f, 0, 0, 0, 0,
            0, 0.62f, 0, 0, 0,
            0, 0, 0.66f, 0, 0,
            0, 0, 0, 1, 0
        });
        m.postConcat(escurecer);
        pinturaTile.setColorFilter(new ColorMatrixColorFilter(m));

        contornoRota.setStyle(Paint.Style.STROKE);
        contornoRota.setColor(Color.parseColor("#050505"));
        contornoRota.setStrokeWidth(18f);
        contornoRota.setStrokeCap(Paint.Cap.ROUND);
        contornoRota.setStrokeJoin(Paint.Join.ROUND);

        tracoRota.setStyle(Paint.Style.STROKE);
        tracoRota.setColor(Color.parseColor("#D4AF37"));
        tracoRota.setStrokeWidth(11f);
        tracoRota.setStrokeCap(Paint.Cap.ROUND);
        tracoRota.setStrokeJoin(Paint.Join.ROUND);

        marcador.setColor(Color.parseColor("#D4AF37"));
        auraMarcador.setColor(Color.parseColor("#33D4AF37"));
    }

    /** Chamado quando a Activity morre: nada de thread viva depois da viagem. */
    public void encerrar() {
        desligado = true;
        trabalhadores.shutdownNow();
        memoria.evictAll();
    }

    /* ============================================================== *
     * Projeção Web Mercator
     * ============================================================== */

    private static double mundoX(double lng, int zoom) {
        return (lng + 180d) / 360d * TILE * Math.pow(2, zoom);
    }

    private static double mundoY(double lat, int zoom) {
        final double r = Math.toRadians(Math.max(-85d, Math.min(85d, lat)));
        final double y = Math.log(Math.tan(r) + 1d / Math.cos(r));
        return (1d - y / Math.PI) / 2d * TILE * Math.pow(2, zoom);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        final int largura = getWidth();
        final int altura = getHeight();
        if (largura <= 0 || altura <= 0) return;

        final double[] centro = centroDaCamera();
        if (centro == null || desligado) {
            super.onDraw(canvas);
            return;
        }

        canvas.drawColor(Color.parseColor("#0B0B0B"));

        final double cx = mundoX(centro[1], ZOOM);
        final double cy = mundoY(centro[0], ZOOM);
        // Motociclista no terço inferior: mais estrada à frente, como no cockpit.
        final float ancoraX = largura / 2f;
        final float ancoraY = altura * 0.62f;

        final boolean algumTile = desenharTiles(canvas, cx, cy, ancoraX, ancoraY, largura, altura);
        if (!algumTile) {
            // Fase C: sem tile nenhum, o traçado simplificado assume.
            super.onDraw(canvas);
            return;
        }
        if (!mapaPronto) {
            mapaPronto = true;
            LockDiagnostics.registrar(getContext(), "MAP_READY");
        }

        desenharRota(canvas, cx, cy, ancoraX, ancoraY);
        if (temPosicao) {
            final float x = (float) (ancoraX + (mundoX(lng, ZOOM) - cx));
            final float y = (float) (ancoraY + (mundoY(lat, ZOOM) - cy));
            canvas.drawCircle(x, y, 26f, auraMarcador);
            canvas.drawCircle(x, y, 12f, marcador);
        }
    }

    /** Posição real quando existe; senão o meio do traçado já calculado. */
    private double[] centroDaCamera() {
        if (temPosicao) return new double[] {lat, lng};
        final int n = rota.length / 2;
        if (n == 0) return null;
        return new double[] {rota[(n / 2) * 2], rota[(n / 2) * 2 + 1]};
    }

    private boolean desenharTiles(
            Canvas canvas, double cx, double cy, float ancoraX, float ancoraY, int largura, int altura) {
        final int max = (int) Math.pow(2, ZOOM);
        final double esquerda = cx - ancoraX;
        final double topo = cy - ancoraY;
        final int primeiroX = (int) Math.floor(esquerda / TILE);
        final int primeiroY = (int) Math.floor(topo / TILE);
        final int ultimoX = (int) Math.floor((esquerda + largura) / TILE);
        final int ultimoY = (int) Math.floor((topo + altura) / TILE);

        boolean algum = false;
        for (int tx = primeiroX; tx <= ultimoX; tx++) {
            for (int ty = primeiroY; ty <= ultimoY; ty++) {
                if (ty < 0 || ty >= max) continue;
                final int normalX = ((tx % max) + max) % max;
                final Bitmap b = obterTile(normalX, ty);
                if (b == null) continue;
                final float px = (float) (tx * TILE - esquerda);
                final float py = (float) (ty * TILE - topo);
                canvas.drawBitmap(b, px, py, pinturaTile);
                algum = true;
            }
        }
        return algum;
    }

    private void desenharRota(Canvas canvas, double cx, double cy, float ancoraX, float ancoraY) {
        final int n = rota.length / 2;
        if (n < 2) return;
        caminhoRota.reset();
        for (int i = 0; i < n; i++) {
            final float x = (float) (ancoraX + (mundoX(rota[i * 2 + 1], ZOOM) - cx));
            final float y = (float) (ancoraY + (mundoY(rota[i * 2], ZOOM) - cy));
            if (i == 0) caminhoRota.moveTo(x, y);
            else caminhoRota.lineTo(x, y);
        }
        canvas.drawPath(caminhoRota, contornoRota);
        canvas.drawPath(caminhoRota, tracoRota);
    }

    /* ============================================================== *
     * Cache de tiles: memória → disco → rede. Nunca bloqueia o desenho.
     * ============================================================== */

    private Bitmap obterTile(int x, int y) {
        final String chave = ZOOM + "_" + x + "_" + y;
        final Bitmap emMemoria = memoria.get(chave);
        if (emMemoria != null) return emMemoria;
        pedirTile(chave, x, y);
        return null;
    }

    private void pedirTile(final String chave, final int x, final int y) {
        if (desligado) return;
        synchronized (baixando) {
            if (baixando.contains(chave)) return;
            baixando.add(chave);
        }
        try {
            trabalhadores.execute(new Runnable() {
                @Override
                public void run() {
                    Bitmap b = lerDoDisco(chave);
                    if (b == null) b = baixar(chave, x, y);
                    final Bitmap pronto = b;
                    synchronized (baixando) {
                        baixando.remove(chave);
                    }
                    if (pronto == null || desligado) return;
                    principal.post(new Runnable() {
                        @Override
                        public void run() {
                            memoria.put(chave, pronto);
                            invalidate();
                        }
                    });
                }
            });
        } catch (Exception ignored) {
            synchronized (baixando) {
                baixando.remove(chave);
            }
        }
    }

    private File pastaDeCache() {
        final File pasta = new File(getContext().getCacheDir(), "lockmap");
        if (!pasta.exists()) pasta.mkdirs();
        return pasta;
    }

    private Bitmap lerDoDisco(String chave) {
        try {
            final File f = new File(pastaDeCache(), chave + ".png");
            if (!f.exists()) return null;
            return BitmapFactory.decodeFile(f.getAbsolutePath());
        } catch (Exception ignored) {
            return null;
        }
    }

    /** Sem rede: devolve null, e a Fase C assume. Nenhuma exceção sobe. */
    private Bitmap baixar(String chave, int x, int y) {
        HttpURLConnection conexao = null;
        try {
            final URL url = new URL(String.format(java.util.Locale.US, TEMPLATE, ZOOM, x, y));
            conexao = (HttpURLConnection) url.openConnection();
            conexao.setRequestProperty("User-Agent", AGENTE);
            conexao.setConnectTimeout(6000);
            conexao.setReadTimeout(6000);
            if (conexao.getResponseCode() != 200) return null;
            final InputStream entrada = conexao.getInputStream();
            final Bitmap b = BitmapFactory.decodeStream(entrada);
            entrada.close();
            if (b != null) gravarNoDisco(chave, b);
            return b;
        } catch (Exception ignored) {
            return null;
        } finally {
            if (conexao != null) conexao.disconnect();
        }
    }

    private void gravarNoDisco(String chave, Bitmap b) {
        try {
            final File pasta = pastaDeCache();
            final File[] atuais = pasta.listFiles();
            // Cache limitado: mapa de bloqueio não vira depósito de tiles.
            if (atuais != null && atuais.length > 400) {
                for (int i = 0; i < 100 && i < atuais.length; i++) atuais[i].delete();
            }
            final FileOutputStream saida = new FileOutputStream(new File(pasta, chave + ".png"));
            b.compress(Bitmap.CompressFormat.PNG, 100, saida);
            saida.close();
        } catch (Exception ignored) {
            // Cache é conforto, não requisito.
        }
    }
}
