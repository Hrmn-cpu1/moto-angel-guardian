package com.motoanjo.app;

/**
 * Estado da navegação na tela de bloqueio (P0.1c).
 *
 * POR QUE É SÓ UM ESPELHO
 * A viagem tem fonte única no JavaScript (`src/lib/trip.ts`). Este holder NÃO
 * decide se há viagem, não calcula rota e não abre SOS por conta própria: ele
 * guarda o último quadro que o app publicou para que a Activity de bloqueio
 * possa desenhá-lo sem WebView, sem segundo mapa e sem segundo GPS.
 *
 * Se o processo morrer, o snapshot morre junto — e é assim que tem de ser.
 * Ao voltar, quem diz se a viagem continua ativa é o estado persistido do app,
 * nunca a recriação de uma Activity.
 */
public final class LockNavigationState {

    private LockNavigationState() {}

    /** Um quadro de navegação. Sem nome, e-mail, telefone ou contato: a tela
     *  de bloqueio é pública por definição. */
    public static final class Quadro {
        public final boolean ativa;
        /** O usuário permitiu mostrar navegação na tela bloqueada. */
        public final boolean permitida;
        public final String manobra;
        public final String distanciaManobra;
        public final String destino;
        public final String restante;
        public final String eta;
        public final String risco;
        public final double lat;
        public final double lng;
        /** Pares lat,lng do traçado já reduzido pelo app. Pode ser vazio. */
        public final double[] rota;

        public Quadro(
                boolean ativa,
                boolean permitida,
                String manobra,
                String distanciaManobra,
                String destino,
                String restante,
                String eta,
                String risco,
                double lat,
                double lng,
                double[] rota) {
            this.ativa = ativa;
            this.permitida = permitida;
            this.manobra = texto(manobra);
            this.distanciaManobra = texto(distanciaManobra);
            this.destino = texto(destino);
            this.restante = texto(restante);
            this.eta = texto(eta);
            this.risco = texto(risco);
            this.lat = lat;
            this.lng = lng;
            this.rota = rota == null ? new double[0] : rota;
        }

        private static String texto(String v) {
            return v == null ? "" : v.trim();
        }
    }

    public interface Ouvinte {
        void aoMudar(Quadro q);
    }

    /** Pedido de SOS vindo da tela de bloqueio. Encaminhado ao MESMO pipeline
     *  de SOS que já existe no app — nenhum segundo caminho de emergência. */
    public interface CanalDeSos {
        void aoPedir();
    }

    private static final Quadro VAZIO =
            new Quadro(false, false, "", "", "", "", "", "", 0d, 0d, new double[0]);

    private static volatile Quadro atual = VAZIO;
    private static volatile Ouvinte ouvinte = null;
    private static volatile CanalDeSos canalDeSos = null;
    private static volatile Runnable fechamento = null;

    public static Quadro atual() {
        return atual;
    }

    public static void publicar(Quadro q) {
        atual = q == null ? VAZIO : q;
        final Ouvinte o = ouvinte;
        if (o != null) o.aoMudar(atual);
        // Viagem encerrada não pode deixar navegação de pé sobre o bloqueio.
        if (!atual.ativa) fechar();
    }

    public static void definirOuvinte(Ouvinte o) {
        ouvinte = o;
    }

    public static void removerOuvinte(Ouvinte o) {
        if (ouvinte == o) ouvinte = null;
    }

    public static void definirCanalDeSos(CanalDeSos c) {
        canalDeSos = c;
    }

    public static void pedirSos() {
        final CanalDeSos c = canalDeSos;
        if (c != null) c.aoPedir();
    }

    /** A Activity registra como se fechar; o serviço usa ao desbloquear. */
    public static void definirFechamento(Runnable r) {
        fechamento = r;
    }

    public static void removerFechamento(Runnable r) {
        if (fechamento == r) fechamento = null;
    }

    public static void fechar() {
        final Runnable r = fechamento;
        if (r != null) r.run();
    }

    /** Fim da viagem: nada sobra para a próxima. */
    public static void limpar() {
        atual = VAZIO;
        fechar();
    }
}
