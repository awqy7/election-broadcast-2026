export interface Migration {
  name: string;
  sql: string;
}

// O SQL fica embutido no bundle de propósito: o servidor precisa funcionar a
// partir de dist/server/main.js sem depender da árvore de fontes nem do diretório
// atual. `name` é gravado na tabela `migrations`; renomear uma entrada faz a
// migração ser reaplicada em bancos já existentes e quebra a abertura do banco.
export const migrations: readonly Migration[] = [
  {
    name: "001_initial.sql",
    sql: `
CREATE TABLE kv (key TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE snapshot (id INTEGER PRIMARY KEY, election TEXT NOT NULL, scope TEXT NOT NULL, office TEXT NOT NULL, resource TEXT NOT NULL, idg TEXT NOT NULL, generatedAt TEXT NOT NULL, receivedAt TEXT NOT NULL, hash TEXT NOT NULL, json TEXT NOT NULL, raw TEXT NOT NULL);
CREATE INDEX snapshot_resource ON snapshot(resource,id DESC);
CREATE TABLE http_cache (resource TEXT PRIMARY KEY, etag TEXT, lastModified TEXT, body TEXT NOT NULL);
`.trim(),
  },
  {
    name: "002_broadcast_state.sql",
    sql: `
CREATE TABLE broadcast_event (id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, operatorAction TEXT NOT NULL, previousState TEXT NOT NULL, nextState TEXT NOT NULL);
`.trim(),
  },
  {
    name: "003_fetch_logs.sql",
    sql: `
CREATE TABLE fetch_log (id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, resource TEXT NOT NULL, urlHash TEXT NOT NULL, status INTEGER NOT NULL, durationMs INTEGER NOT NULL, etag TEXT, changed INTEGER NOT NULL, error TEXT);
`.trim(),
  },
];
