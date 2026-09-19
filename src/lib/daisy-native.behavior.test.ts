import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { criarReconhecimentoDaisy } from "./daisy";

const ler = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe("DAISY no APK Android", () => {
  it("usa o plugin nativo e devolve a frase reconhecida", async () => {
    let parou = false;
    const plugin = {
      available: async () => ({ available: true }),
      start: async () => ({ text: "Daisy iniciar viagem segura" }),
      stop: async () => {
        parou = true;
      },
    };
    (globalThis as Record<string, unknown>).window = {
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: { DaisySpeech: plugin },
      },
    };

    const frases: string[] = [];
    const erros: string[] = [];
    const reconhecimento = criarReconhecimentoDaisy({
      onResult: (text) => frases.push(text),
      onError: (message) => erros.push(message),
    });

    expect(await reconhecimento.available()).toBe(true);
    await reconhecimento.start();
    await reconhecimento.stop();
    expect(frases).toEqual(["Daisy iniciar viagem segura"]);
    expect(erros).toEqual([]);
    expect(parou).toBe(true);
  });

  it("não mostra cancelamento voluntário como falha", async () => {
    (globalThis as Record<string, unknown>).window = {
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          DaisySpeech: {
            available: async () => ({ available: true }),
            start: async () => {
              throw { code: "DAISY_CANCELLED", message: "Escuta cancelada." };
            },
            stop: async () => undefined,
          },
        },
      },
    };

    const erros: string[] = [];
    const reconhecimento = criarReconhecimentoDaisy({
      onResult: () => undefined,
      onError: (message) => erros.push(message),
    });
    await reconhecimento.start();
    expect(erros).toEqual([]);
  });

  it("declara, registra e pede a permissão do microfone no uso", () => {
    const manifest = ler("android/app/src/main/AndroidManifest.xml");
    const main = ler("android/app/src/main/java/com/motoanjo/app/MainActivity.java");
    const plugin = ler("android/app/src/main/java/com/motoanjo/app/DaisySpeechPlugin.java");

    expect(manifest).toContain("android.permission.RECORD_AUDIO");
    expect(manifest).toContain("android.speech.RecognitionService");
    expect(main).toContain("registerPlugin(DaisySpeechPlugin.class)");
    expect(plugin).toContain('name = "DaisySpeech"');
    expect(plugin).toContain("requestPermissionForAlias(ALIAS_MICROFONE");
    expect(plugin).toContain("SpeechRecognizer.createSpeechRecognizer");
  });
});
