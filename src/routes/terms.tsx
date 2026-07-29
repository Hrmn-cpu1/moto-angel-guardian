import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { GoldButton } from "@/components/GoldButton";
import { useAuth } from "@/hooks/useAuth";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

export const Route = createFileRoute("/terms")({
  validateSearch: (s: Record<string, unknown>) => ({
    accept: s.accept === "1" || s.accept === true ? true : false,
  }),
  head: () => ({
    meta: [
      { title: "Termos de Uso — Moto Anjo" },
      { name: "description", content: "Termos de Uso do aplicativo Moto Anjo." },
      { property: "og:title", content: "Termos de Uso — Moto Anjo" },
      { property: "og:description", content: "Leia os Termos de Uso do Moto Anjo." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const navigate = useNavigate();
  const { accept } = useSearch({ from: "/terms" });
  const { user, updateUser } = useAuth();

  const handleAccept = () => {
    if (!user) return;
    updateUser({
      termsAcceptedAt: new Date().toISOString(),
      termsVersion: CURRENT_TERMS_VERSION,
    });
    navigate({ to: "/dashboard" });
  };

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
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">Documento legal</p>
          <h1 className="truncate text-lg font-black text-foreground">Termos de Uso</h1>
        </div>
        <ShieldCheck size={20} className="text-gold" />
      </header>

      <main className="scroll-smooth px-5 pb-32 pt-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Versão {CURRENT_TERMS_VERSION}
        </p>

        <Section title="1. Aceitação dos Termos">
          Ao criar sua conta e utilizar o Moto Anjo, você declara ter lido, compreendido e concordado
          integralmente com estes Termos de Uso e com nossa{" "}
          <Link to="/privacy" className="text-gold underline">Política de Privacidade</Link>. Caso
          não concorde, você deve interromper imediatamente o uso do aplicativo.
        </Section>

        <Section title="2. Descrição do Moto Anjo">
          O Moto Anjo é uma plataforma voltada a motociclistas, oferecendo comunidade, rastreamento
          de viagens, compartilhamento de localização, chat entre usuários e acionamento de
          emergência (SOS). O aplicativo é uma ferramenta auxiliar e não substitui serviços
          oficiais de emergência (SAMU 192, Polícia 190, Bombeiros 193).
        </Section>

        <Section title="3. Cadastro e Conta do Usuário">
          Para utilizar o Moto Anjo é necessário fornecer dados verdadeiros, completos e atualizados.
          Você é o único responsável pela guarda de suas credenciais e por toda atividade realizada
          em sua conta. Menores de 18 anos só poderão utilizar o app com consentimento e supervisão
          do responsável legal.
        </Section>

        <Section title="4. Responsabilidades do Usuário">
          Você concorda em utilizar o Moto Anjo de forma ética e legal, respeitando as leis de
          trânsito, os demais usuários e a integridade da plataforma. É proibido manipular o
          aplicativo enquanto pilota — utilize sempre com a moto parada ou por meio de suportes
          adequados e comandos por voz.
        </Section>

        <Section title="5. Uso adequado da plataforma">
          É vedado utilizar o Moto Anjo para: (a) divulgar conteúdo ilícito, ofensivo, discriminatório
          ou que incite violência; (b) praticar spam ou publicidade não autorizada; (c) tentar
          burlar mecanismos de segurança; (d) coletar dados de outros usuários sem autorização.
        </Section>

        <Section title="6. Sistema SOS e Emergências">
          O botão SOS envia sua localização e um alerta aos contatos de confiança cadastrados. O
          Moto Anjo empenha esforços razoáveis para entrega dos alertas, mas não garante o
          recebimento pelos destinatários, tampouco a atuação de serviços públicos de emergência.
          O uso indevido ou trote configura violação destes Termos e pode acarretar suspensão
          imediata da conta e responsabilização legal.
        </Section>

        <Section title="7. Compartilhamento de localização">
          O compartilhamento de localização é opcional e depende de sua permissão explícita. Você
          pode revogar essa permissão a qualquer momento nas configurações do dispositivo. Os
          links de localização gerados podem ser acessados por quem os receber — compartilhe apenas
          com pessoas de confiança.
        </Section>

        <Section title="8. Chat entre usuários">
          Ao utilizar o chat, você é responsável pelo conteúdo enviado. Mensagens que violem estes
          Termos poderão ser removidas e o autor sancionado. O Moto Anjo poderá, mediante ordem
          judicial, fornecer registros de acesso conforme a legislação aplicável.
        </Section>

        <Section title="9. Privacidade e tratamento de dados (LGPD)">
          O tratamento de dados pessoais segue a Lei nº 13.709/2018 (LGPD) e está detalhado em nossa{" "}
          <Link to="/privacy" className="text-gold underline">Política de Privacidade</Link>.
        </Section>

        <Section title="10. Limitação de responsabilidade">
          O Moto Anjo é fornecido "como está". Não nos responsabilizamos por danos decorrentes de:
          indisponibilidade temporária do serviço; falhas de conectividade, GPS ou de terceiros;
          uso incorreto do aplicativo; ou de decisões tomadas com base em informações exibidas
          no app.
        </Section>

        <Section title="11. Suspensão ou encerramento da conta">
          Podemos suspender ou encerrar contas que violem estes Termos, sem aviso prévio, sem
          prejuízo das medidas legais cabíveis. Você pode solicitar o encerramento da sua conta a
          qualquer momento pelo menu Perfil.
        </Section>

        <Section title="12. Alterações dos Termos">
          Estes Termos podem ser atualizados periodicamente. Alterações relevantes exigirão nova
          aceitação antes do próximo uso do aplicativo. A data desta versão está indicada no topo
          desta página.
        </Section>

        <Section title="13. Contato e suporte">
          Dúvidas, solicitações ou notificações devem ser enviadas para{" "}
          <span className="text-gold">suporte@motoanjo.app</span>.
        </Section>

        {accept && user && (
          <div className="mt-8 rounded-2xl border border-emergency/40 bg-emergency/5 p-4 text-xs text-foreground">
            <p className="font-semibold text-emergency">Nova versão dos Termos de Uso</p>
            <p className="mt-1 text-muted-foreground">
              Para continuar usando o Moto Anjo, aceite a versão atualizada abaixo.
            </p>
            <div className="mt-3">
              <GoldButton onClick={handleAccept}>Li e aceito os novos Termos</GoldButton>
            </div>
          </div>
        )}
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