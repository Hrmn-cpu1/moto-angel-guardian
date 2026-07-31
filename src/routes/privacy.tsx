import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Moto Anjo" },
      {
        name: "description",
        content: "Como o Moto Anjo trata seus dados pessoais conforme a LGPD.",
      },
      { property: "og:title", content: "Política de Privacidade — Moto Anjo" },
      { property: "og:description", content: "Política de Privacidade do Moto Anjo." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto min-h-screen max-w-md bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gold/10 bg-background/85 px-5 py-4 backdrop-blur">
        <button
          onClick={() => navigate({ to: ".." as never })}
          className="rounded-full border border-gold/20 p-2 text-gold hover:bg-gold/10"
          aria-label="Voltar"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">LGPD</p>
          <h1 className="truncate text-lg font-black text-foreground">Política de Privacidade</h1>
        </div>
        <Lock size={20} className="text-gold" />
      </header>

      <main className="scroll-smooth px-5 pb-32 pt-4">
        <Section title="1. Dados coletados">
          Coletamos dados de cadastro (nome, e-mail, telefone, modelo/placa da moto, tipo sanguíneo,
          contato de emergência), dados de uso (histórico de viagens, alertas SOS, publicações na
          comunidade) e dados de localização quando autorizado pelo dispositivo.
        </Section>
        <Section title="2. Finalidade da coleta">
          Os dados são utilizados para: autenticação, prestação dos serviços do Moto Anjo, envio de
          alertas de emergência, exibição de rotas e pontos de apoio, personalização de experiência
          e cumprimento de obrigações legais.
        </Section>
        <Section title="3. Compartilhamento de informações">
          Não vendemos seus dados. Podemos compartilhá-los com: (a) contatos de emergência que você
          cadastrou, quando acionar o SOS; (b) provedores de infraestrutura sob contrato de
          confidencialidade; (c) autoridades competentes mediante requisição legal.
        </Section>
        <Section title="4. Geolocalização">
          A localização é obtida somente enquanto o app é utilizado e apenas com sua permissão. É
          usada para exibir mapas, calcular viagens e compor os alertas SOS. Você pode desativar a
          permissão a qualquer momento nas configurações do sistema operacional.
        </Section>
        <Section title="5. Cookies e tecnologias utilizadas">
          Utilizamos armazenamento local do dispositivo (localStorage / Preferences) para manter sua
          sessão e preferências. Não utilizamos cookies de rastreamento publicitário.
        </Section>
        <Section title="6. Segurança dos dados">
          Adotamos medidas técnicas e organizacionais para proteger seus dados contra acessos não
          autorizados, perda ou destruição. Nenhum sistema, entretanto, é 100% imune a incidentes;
          em caso de violação, comunicaremos os titulares e a ANPD conforme a LGPD.
        </Section>
        <Section title="7. Direitos do usuário conforme LGPD">
          Você pode, a qualquer momento, solicitar: confirmação de tratamento, acesso, correção,
          anonimização, portabilidade, eliminação, informações sobre compartilhamento e revogação do
          consentimento — nos termos dos artigos 18 e seguintes da LGPD.
        </Section>
        <Section title="8. Exclusão da conta">
          Você pode excluir sua conta pelo menu Perfil ou solicitando ao encarregado de dados. A
          exclusão apaga seus dados pessoais, ressalvadas as informações que devemos reter por
          obrigação legal.
        </Section>
        <Section title="9. Contato do responsável pelos dados">
          Encarregado (DPO): <span className="text-gold">dpo@motoanjo.app</span>. Consulte também os{" "}
          <Link to="/terms" search={{ accept: false }} className="text-gold underline">
            Termos de Uso
          </Link>
          .
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 animate-fade-up">
      <h2 className="text-sm font-black uppercase tracking-wider text-gold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground/85">{children}</p>
    </section>
  );
}
