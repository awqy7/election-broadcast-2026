// Testes das funcoes que decidem o que o cliente vai ver na tela de
// instalacao. Um erro aqui aparece para o usuario final no meio da
// instalacao, entao vale travar o comportamento.
import { describe, expect, it } from "vitest";
import {
  KEY_MIN_LENGTH,
  buildEnv,
  buildSummary,
  buildUrls,
  classifyInstallPath,
  isPrivateAddress,
  parseEnv,
  pickLanAddress,
  resolveHost,
  resolverRaiz,
} from "../scripts/setup-core.mjs";

const iface = (address: string, extra: Record<string, unknown> = {}) => ({
  address,
  family: "IPv4",
  internal: false,
  ...extra,
});

describe("isPrivateAddress", () => {
  it.each([
    ["192.168.0.110", true],
    ["10.0.0.5", true],
    ["172.16.4.9", true],
    ["172.32.0.1", false],
    ["8.8.8.8", false],
    ["127.0.0.1", false],
    ["169.254.10.1", false],
  ])("%s -> %s", (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});

describe("pickLanAddress", () => {
  it("ignora loopback, link-local e IPv6", () => {
    const found = pickLanAddress({
      lo: [iface("127.0.0.1", { internal: true })],
      eth0: [{ address: "fe80::1", family: "IPv6", internal: false }],
      eth1: [iface("169.254.3.3")],
    } as never);
    expect(found).toBeNull();
  });

  it("prefere rede privada a IP publico", () => {
    const found = pickLanAddress({
      wlan0: [iface("8.8.8.8")],
      eth0: [iface("192.168.0.110")],
    } as never);
    expect(found).toEqual({ address: "192.168.0.110", iface: "eth0" });
  });

  it("ignora adaptadores virtuais comuns (VPN e Hyper-V)", () => {
    const found = pickLanAddress({
      docker0: [iface("172.17.0.1")],
      vethernet: [iface("192.168.200.1")],
      eth0: [iface("10.0.0.7")],
    } as never);
    expect(found?.address).toBe("10.0.0.7");
  });

  it("devolve null sem rede privada", () => {
    expect(pickLanAddress({ eth0: [iface("8.8.8.8")] } as never)).toBeNull();
  });
});

describe("parseEnv", () => {
  it("ignora comentario, linha vazia e remove aspas", () => {
    const values = parseEnv(
      [
        "# um comentario",
        "",
        "DATA_MODE=tse",
        'ADMIN_ACCESS_KEY="abc123"',
        "  ESPACADO=valor  ",
        "SEM_IGUAL",
      ].join("\n"),
    );
    expect(values.get("DATA_MODE")).toBe("tse");
    expect(values.get("ADMIN_ACCESS_KEY")).toBe("abc123");
    expect(values.get("ESPACADO")).toBe("valor");
    expect(values.has("SEM_IGUAL")).toBe(false);
  });
});

describe("buildEnv", () => {
  const key = "a".repeat(KEY_MIN_LENGTH);

  it("gera HOST e chave novo quando nao ha .env anterior", () => {
    const result = buildEnv({ host: "192.168.0.110", key });
    expect(result.keyPreserved).toBe(false);
    expect(result.text).toContain("HOST=192.168.0.110");
    expect(result.text).toContain(`ADMIN_ACCESS_KEY=${key}`);
    // Entrega oficial nao pode nascer em modo de teste.
    expect(result.text).toContain("DATA_MODE=tse");
  });

  it("preserva a chave em reinstalacao, para nao quebrar a sessao", () => {
    const anterior = buildEnv({ host: "10.0.0.1", key }).text;
    const result = buildEnv({
      existing: anterior,
      host: "10.0.0.9",
      key: "b" + "b",
    });
    expect(result.key).toBe(key);
    expect(result.keyPreserved).toBe(true);
    expect(result.text).toContain("HOST=10.0.0.9");
  });

  it("troca a chave se a anterior for curta demais", () => {
    const result = buildEnv({
      existing: "ADMIN_ACCESS_KEY=curta",
      host: "10.0.0.1",
      key,
    });
    expect(result.key).toBe(key);
    expect(result.keyPreserved).toBe(false);
  });
});

describe("resolveHost", () => {
  // O servidor fica ligado apenas no HOST configurado. Se o HOST for um IP
  // concreto, o loopback nao responde, e a URL mostrada ao operador estaria
  // errada se usasse 127.0.0.1.
  it("mantem o IP concreto configurado", () => {
    expect(resolveHost("192.168.0.110")).toBe("192.168.0.110");
  });

  it.each(["0.0.0.0", "::", "[::]", "", undefined])(
    "troca o curinga %s pelo IP da rede",
    (value) => {
      expect(resolveHost(value, "192.168.0.110")).toBe("192.168.0.110");
    },
  );

  it("sem IP de rede disponivel, cai no loopback", () => {
    expect(resolveHost("0.0.0.0")).toBe("127.0.0.1");
  });

  it("normaliza localhost e IPv6 entre colchetes", () => {
    expect(resolveHost("localhost")).toBe("127.0.0.1");
    expect(resolveHost("[fe80::1]")).toBe("fe80::1");
  });
});

describe("buildUrls", () => {
  it("usa o endereco que o servidor realmente escuta", () => {
    const urls = buildUrls("192.168.0.110", 8787);
    expect(urls.base).toBe("http://192.168.0.110:8787");
    expect(urls.studio).toBe("http://192.168.0.110:8787/studio");
    expect(urls.overlay).toBe("http://192.168.0.110:8787/overlay/program");
    expect(urls.health).toBe("http://192.168.0.110:8787/health");
  });

  it("nunca sugere 127.0.0.1 quando o servidor so escuta o IP da rede", () => {
    expect(JSON.stringify(buildUrls("192.168.0.110", 8787))).not.toContain(
      "127.0.0.1",
    );
  });

  it("aceita a porta como texto, vinda do .env", () => {
    expect(buildUrls("10.0.0.1", "8788").base).toBe("http://10.0.0.1:8788");
  });
});

describe("classifyInstallPath", () => {
  it("aceita a pasta padrao do instalador", () => {
    expect(
      classifyInstallPath(
        "C:\\Users\\Operador\\AppData\\Local\\ElectionBroadcast2026",
      ),
    ).toEqual([]);
  });

  it("recusa pasta sincronizada por nuvem, que corrompe o banco", () => {
    const problemas = classifyInstallPath(
      "C:\\Users\\Operador\\OneDrive\\ElectionBroadcast2026",
    );
    expect(problemas.some((p) => p.level === "erro")).toBe(true);
    expect(problemas[0].message).toMatch(/nuvem/i);
  });

  it("avisa sobre espaco no nome e sobre Program Files", () => {
    const problemas = classifyInstallPath(
      "C:\\Program Files\\Election Broadcast",
    );
    expect(problemas.some((p) => p.level === "aviso")).toBe(true);
  });

  it("tratar pasta vazia como erro", () => {
    expect(classifyInstallPath("")[0]).toEqual({
      level: "erro",
      message: "Pasta de instalacao vazia.",
    });
  });
});

describe("buildSummary", () => {
  const urls = buildUrls("192.168.0.110", 8787);

  it("mostra a chave e a URL da saida", () => {
    const texto = buildSummary({
      urls,
      key: "CHAVE-DE-TESTE",
      host: "192.168.0.110",
      privateNetwork: true,
    });
    expect(texto).toContain("CHAVE-DE-TESTE");
    expect(texto).toContain("http://192.168.0.110:8787/overlay/program");
    expect(texto).toContain("ABA DA SAIDA");
    expect(texto).toContain("1920 x 1080");
  });

  it("nao repete a mesma URL nos dois rotulos de acesso", () => {
    const texto = buildSummary({
      urls,
      key: "k",
      host: "192.168.0.110",
      privateNetwork: true,
    });
    expect(texto).toContain(
      "Neste computador:   http://192.168.0.110:8787/studio",
    );
    expect(texto).not.toContain("127.0.0.1");
  });

  it("omite o acesso de outro PC quando nao ha rede privada", () => {
    const texto = buildSummary({
      urls: buildUrls("127.0.0.1", 8787),
      key: "k",
      host: "127.0.0.1",
      privateNetwork: false,
    });
    expect(texto).not.toContain("De outro PC da rede");
  });

  // O INSTALAR.bat sobe o modo de ENSAIO na 8788. Com um cartao mostrando so a
  // 8787, o operador lia um endereco que nao estava no ar na hora da instalacao.
  it("mostra os dois modos quando o ensaio e informado", () => {
    const texto = buildSummary({
      urls,
      urlsEnsaio: buildUrls("192.168.0.110", 8788),
      key: "k",
      host: "192.168.0.110",
      privateNetwork: true,
    });
    expect(texto).toContain("MODO OFICIAL");
    expect(texto).toContain("MODO ENSAIO");
    expect(texto).toContain("http://192.168.0.110:8787/studio");
    expect(texto).toContain("http://192.168.0.110:8788/studio");
    expect(texto).toContain("Modo oficial: http://192.168.0.110:8787/overlay");
    expect(texto).toContain("Modo ensaio:  http://192.168.0.110:8788/overlay");
  });

  it("aceita ficar so com um modo", () => {
    const texto = buildSummary({
      urls,
      key: "k",
      host: "192.168.0.110",
      privateNetwork: true,
    });
    expect(texto).not.toContain("MODO ENSAIO");
  });

  it("leva o acesso de outro PC para os dois modos", () => {
    const texto = buildSummary({
      urls,
      urlsEnsaio: buildUrls("192.168.0.110", 8788),
      key: "k",
      host: "192.168.0.110",
      privateNetwork: true,
    });
    const linhas = texto
      .split("\r\n")
      .filter((l) => l.includes("De outro PC da rede"));
    expect(linhas).toHaveLength(2);
  });

  it("usa CRLF para o Bloco de Notas do Windows", () => {
    const texto = buildSummary({
      urls,
      key: "k",
      host: "h",
      privateNetwork: true,
    });
    expect(texto).toContain("\r\n");
  });
});

describe("resolverRaiz", () => {
  const alvo = "C:\\users\\pedro\\AppData\\Local\\ElectionBroadcast2026";

  it("aceita o caminho sem barra no final", () => {
    expect(resolverRaiz(alvo)).toBe(alvo);
  });

  // A armadilha que quebrou a instalacao: "%~dp0" acaba em barra, e a barra
  // antes da aspa de fechamento virava aspa escapada. O script recebia a pasta
  // terminada em aspas, existsSync dava false em tudo e a instalacao abortava
  // com "pacote incompleto" tendo todos os arquivos presentes.
  it("descarta a aspa que sobrou da aspa escapada do Windows", () => {
    expect(resolverRaiz(alvo + '\\"')).toBe(alvo);
  });

  it("descarta barras duplicadas no final", () => {
    expect(resolverRaiz(alvo + "\\\\")).toBe(alvo);
  });

  it("aceita a forma com ponto que os .bat usam", () => {
    expect(resolverRaiz(alvo + "\\.")).toBe(alvo);
  });

  it("mantem espacos do caminho", () => {
    expect(resolverRaiz("C:\\Program Files\\Election Broadcast\\")).toBe(
      "C:\\Program Files\\Election Broadcast",
    );
  });

  it("volta para a pasta atual quando nao recebe nada", () => {
    expect(resolverRaiz(undefined)).toBe(resolverRaiz("."));
  });

  it("resolve caminho relativo", () => {
    expect(resolverRaiz("apps/pacote/")).toBe(resolverRaiz("apps/pacote"));
  });
});
