// Tipos das funcoes puras do instalador, para os testes em TypeScript.
export interface LanAddress {
  address: string;
  iface: string;
}

export function pickLanAddress(
  interfaces: Record<
    string,
    | { address?: string; family?: string | number; internal?: boolean }[]
    | undefined
  >,
): LanAddress | null;

export function isPrivateAddress(address: string): boolean;

export function generateKey(bytes: Uint8Array): string;

export const KEY_MIN_LENGTH: number;

export function parseEnv(text: string): Map<string, string>;

export function buildEnv(args: {
  existing?: string;
  host: string;
  key: string;
}): { text: string; key: string; keyPreserved: boolean };

export function resolveHost(
  configured: string | undefined,
  lanAddress?: string,
): string;

export function buildUrls(
  host: string | undefined,
  port: number | string,
  lanAddress?: string,
): {
  host: string;
  base: string;
  studio: string;
  overlay: string;
  health: string;
};

export function classifyInstallPath(
  installDir: string | undefined,
): { level: "erro" | "aviso"; message: string }[];

export function buildSummary(args: {
  urls: ReturnType<typeof buildUrls>;
  urlsEnsaio?: ReturnType<typeof buildUrls>;
  key: string;
  host: string;
  privateNetwork: boolean;
}): string;

/**
 * Normaliza a pasta do programa recebida pela linha de comando, descartando a
 * aspa que sobra quando "%~dp0" termina em barra e chega entre aspas.
 */
export function resolverRaiz(entrada: string | undefined): string;
