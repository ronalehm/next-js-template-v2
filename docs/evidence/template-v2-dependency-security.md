# Evidencia: remediación de vulnerabilidades en dependencias

- Spec: `docs/specs/template-v2-dependency-security.md` (Fase A, T1–T3)
- Rama: `fix/deps-security` desde `main` `51c9fba`
- Fecha: 2026-11-07 · Node 26.12.1 · npm 11.20.0 · Windows 11 (win32-x64)

## Notas de Next 16.4 (requisito 6)

Leídas en `next@16.4.5/dist/docs/` (paquete descargado fuera del repo antes de tocar nada): `getting-started/upgrading`, `guides/upgrading/version-16`, `guides/upgrading/agent-upgrade` y las entradas `v16.4.0` del historial de versiones.

Los cambios de 16.4 son nuevos y opcionales: `experimental.agentUpgrade`, `agentFeedback`, `turbopackGc`, `turbopackLazyDynamicImports*`, `turbopackPluginRuntimeStrategy`, `turbopackAdditionalRoots`, `ensureStatic`, `navigation`, `prefetch`, `next analyze export`, y compatibilidad con ESLint 10 en `eslint-config-next`. No hay eliminaciones ni cambios de comportamiento que afecten a:

- `app/`: `layout.tsx` (`next/font/google`, `metadata`, `LayoutProps`), `page.tsx` y `globals.css`;
- `next.config.ts`: vacío;
- `eslint.config.mjs`: `core-web-vitals` y `typescript` en flat config con ESLint 9.

Único efecto observado: `next dev` 16.4.5 reescribe el bloque gestionado de `AGENTS.md` (ver Regresión).

## Versiones

| Paquete | Antes | Después | Tipo |
|---|---|---|---|
| `next` | 16.3.8 | 16.4.5 (exacta) | prod |
| `eslint-config-next` | 16.3.8 | 16.4.5 (exacta) | dev |
| `zod` | `^4.6.5` → 4.6.5 | `^4.6.7` → 4.6.7 | prod |
| `shadcn` | `^4.21.0` → 4.21.0, en `dependencies` | `^4.23.0` → 4.23.0, en `devDependencies` | prod → dev |
| `follow-redirects` (vía `axios` 1.20.0) | 1.16.0 | 1.16.2 | lockfile |
| `undici` (vía `jsdom`) | 7.30.0 | 7.30.2 | lockfile |
| `vite` (vía `vitest`) | 8.3.1 | 8.3.6 | lockfile |
| `systeminformation` (vía `shadcn`) | 5.33.15 | 5.33.19 | lockfile |

`axios` sigue en 1.20.0. Ningún otro rango de `package.json` cambió.

Cambios arrastrados por los anteriores, sin cambiar rangos:
- `@next/*` 16.4.5;
- `rolldown` 1.2.16: `vite` 8.3.6 pide `rolldown ~1.2.16`;
- `@oxc-project/types` 0.156.0: `rolldown` 1.2.16 pide `=0.156.0`;
- `postcss` 8.5.28 → 8.5.32 (copia compartida en `node_modules/postcss`): `vite` 8.3.6 pide `postcss ^8.5.32`. Los otros que la usan, `@tailwindcss/postcss` (`^8.5.16`) y `shadcn` 4.23 (`^8.5.23`), ya se cumplían con 8.5.28;
- `nanoid` 3.3.19 → 3.3.20: `postcss` 8.5.32 pide `nanoid ^3.3.20`;
- `zod` 3.25.76, `ajv-formats` 3, `json-schema-typed` 8, `mime-db` 1.54 y `mime-types` 3 desaparecen con el árbol anterior de `shadcn`.

Lockfile: 805 → 736 paquetes. `git diff --numstat main -- package-lock.json` da 536 líneas añadidas y 1115 quitadas. 59 nombres de paquete salen, entre ellos `express`, `body-parser`, `qs` y `@modelcontextprotocol/sdk`.

Comandos, todos con `--ignore-scripts`: `npm install`, después `npm update follow-redirects undici vite systeminformation`, después `npm ci`. Sin `--force`, `overrides`, `.npmrc` ni `npm audit fix`.

## `npm audit`

| | Total | Crítica | Alta | Moderada | Baja |
|---|---|---|---|---|---|
| `npm audit` antes | 23 | 1 | 8 | 13 | 1 |
| `npm audit` después | 15 | 0 | 0 | 13 | 2 |
| `npm audit --omit=dev` antes | 15 | 1 | 7 | 6 | 1 |
| `npm audit --omit=dev` después | **0** | 0 | 0 | 0 | 0 |

Avisos corregidos:
- `next`: GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr, GHSA-p3m5-59mp-jv5r;
- `zod`: GHSA-mrhx-c7xc-m3w5;
- `follow-redirects`: GHSA-q3jh-wrc6-jgq8, GHSA-8r9p-f939-6h3c, GHSA-mrwp-f3q8-3g9p;
- `undici`: 8 avisos;
- `vite`: 6 avisos;
- `systeminformation`: GHSA-3f7j-7jwc-fxfj;
- `@modelcontextprotocol/sdk`: 4 avisos;
- `body-parser`: GHSA-27r3-jxmh-p828;
- `qs`: GHSA-6pq8-jhm2-2vcw.

Las 15 entradas de `npm audit` vienen de 4 avisos en herramientas de desarrollo. El resto son paquetes que solo los arrastran.

## Residuales (solo desarrollo)

| Paquete | Severidad | Aviso | Ruta | Motivo |
|---|---|---|---|---|
| `minimatch` 10.2.6 | moderada | GHSA-g3hv-75wg-m249 | `eslint-config-next` → `typescript-eslint` → `@typescript-eslint/typescript-estree`; `shadcn` → `ts-morph` → `@ts-morph/common` | La corrección es 11.0.1, pero los dos piden `^10` y no está confirmado que la 11 sea compatible. Sin `overrides`, por decisión del usuario 1. `npm audit` solo propone bajar de versión mayor: `eslint-config-next` 15.5.29 o `shadcn` 1.0.0 |
| `deepmerge` 4.3.1 | baja | GHSA-gcqx-w48m-w2h4 | `shadcn` y `shadcn` → `@shadcn/registry` | Sin versión corregida publicada |
| `fast-uri` 3.1.8 | moderada | GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp | `shadcn` → `@dotenvx/dotenvx` → `conf` → `ajv` | Hay corrección dentro del rango (3.1.9). El requisito 4 limita `npm update` a cuatro paquetes, así que no se actualiza en esta fase. **Resuelto en "Corrección transitiva": 3.1.9** |
| `ip-address` 10.7.2 | moderada | GHSA-rxp7-6hxx-x8q5 | `shadcn` → `socks` | Hay corrección dentro del rango (10.7.6). Mismo motivo que `fast-uri`. **Resuelto en "Corrección transitiva": 10.7.6** |

`fast-uri` e `ip-address` no estaban previstos en la simulación de la spec, que esperaba 13 entradas. No llegan por `express` ni por el SDK MCP 1.x, que sí desaparecen, sino por `@dotenvx/dotenvx` y `socks`, que `shadcn` 4.23 sigue usando. Ninguno de los cuatro avisos está en el runtime de la app: `npm audit --omit=dev` da 0.

## Instalación con `--ignore-scripts` (requisito 5)

- `npm ci --ignore-scripts` terminó sin errores. `npm ls --all` da código 0.
- El binario nativo de `unrs-resolver` (`@unrs/resolver-binding-win32-x64-msvc`) se instala como dependencia opcional del lockfile. El `postinstall` (`napi-postinstall`) no hace falta: lint pasa.
- Tests, lint y build pasan con esa instalación. Se cumple el requisito 7 y `README.md` lo recomienda, sin `.npmrc` y sin hacerlo obligatorio para los proyectos derivados.

## Regresión

| Comprobación | Resultado |
|---|---|
| `npx vitest run` | PASS, 47/47 (1 archivo) |
| `npx vitest run .claude/hooks` | PASS, 47/47 |
| `npm run lint` | PASS (código 0, sin avisos) |
| `npm run build` | PASS, Next.js 16.4.5 (Turbopack); `/` y `/_not-found` estáticas |
| `npm ls shadcn` | `shadcn@4.23.0`; `npm ls shadcn --omit=dev` vacío; lockfile `"dev": true` |
| `npx shadcn --help` | Funciona (código 0) |
| `shadcn/tailwind.css` en el build | Resuelto (`exports` → `dist/tailwind.css`). `.next/static/chunks/3b6h7a0lu6ky7.css` incluye sus reglas `@property --scroll-fade-{t,b,s,e,mask}` y `--shimmer-{angle,image,text-fill}`. Sus utilidades y variantes no aparecen porque la app no las usa |
| `grep -r "shadcn" .next/server` | Sin coincidencias: ni `require`, ni `import`, ni ninguna mención |
| `next start -p 3457` | `GET /` 200. Enlaza `/_next/static/chunks/3b6h7a0lu6ky7.css`, que responde 200 (23 679 bytes) e incluye las reglas de `shadcn`. Proceso detenido |
| `next dev -p 3458` | `GET /` 200 (dos veces), con "Hello world!" y la hoja de estilos enlazada. Sin errores en la salida del servidor. Proceso detenido |
| Prueba manual en el navegador con `npm run dev`, en `C:\Users\ronal\template-v2-deps` | **PASS, según informa el usuario (2026-11-07):** la página carga, estilos y componentes correctos, consola del navegador sin errores, terminal de Next.js sin errores y la recarga funciona |

`next dev` 16.4.5 reescribió `AGENTS.md` (1 línea, bloque gestionado, aviso "Generated AGENTS.md for AI agents"). Se restauró con `git checkout -- AGENTS.md`. Volverá a ocurrir con cada `next dev` mientras no se haga commit de ese bloque o se ponga `agentRules: false`. Las dos cosas quedan fuera del alcance de esta spec.

### Análisis de `AGENTS.md` y `agentRules` (cierre de fase, sin cambios)

- **Causa:** el texto del bloque gestionado cambió entre versiones.
  - `next` 16.3.8 (`dist/server/lib/generate-agent-files.js`) escribe `# This is NOT the Next.js you know`.
  - `next` 16.4.5 escribe `## This is NOT the Next.js you know`.
  - Con 16.4.5, `next dev` vuelve a escribir el bloque cuando detecta un agente: Claude Code, por ejemplo. La única diferencia es el nivel del encabezado.
- **`agentRules: false`** (`next.config.ts`, desde 16.3; en 16.4 además borra el bloque existente) no es una buena corrección para esta plantilla. Hay tres motivos:
  - `AGENTS.md` solo contiene ese bloque, así que el siguiente `next dev` borraría el archivo;
  - `CLAUDE.md` lo importa con `@AGENTS.md`, y la instrucción de leer `node_modules/next/dist/docs/` dejaría de llegar a los agentes;
  - el borrado lo haría un proceso de Next, fuera de `guard`, sobre un archivo de gobierno.
- **Diff exacto:** se reprodujo con `writeAgentFiles()` de `next` 16.4.5 sobre una copia de `AGENTS.md` fuera del repo.
  - Solo cambia la línea 3: `-# This is NOT the Next.js you know` / `+## This is NOT the Next.js you know`.
  - `CLAUDE.md` no cambia.
  - Una segunda ejecución devuelve `unchanged`.
- **Prueba del usuario (2026-11-07):** después de `npm run dev` en su terminal, `git diff -- AGENTS.md` sale vacío. Next solo reescribe el bloque cuando detecta un agente de IA, y en esa ejecución no lo detectó.
- **Decisión del usuario:**
  - Se registra como observación del comportamiento automático de Next.js. No es un bloqueo reproducido en uso normal.
  - No se modifica `AGENTS.md` y no se abre una autorización de gobierno por este motivo.
  - Si un agente ejecuta `next dev`, el cambio de esa línea no se incluye en los commits.

## Actualizaciones compatibles pendientes (autorización separada)

`fast-uri` 3.1.8 → 3.1.9 e `ip-address` 10.7.2 → 10.7.6 se corrigen dentro de sus rangos con `npm update fast-uri ip-address --ignore-scripts`. No se aplicaron porque el requisito 4 de esta spec limita `npm update` a cuatro paquetes. Ambos son solo de desarrollo: entran por el CLI de `shadcn`, y `npm audit --omit=dev` da 0. Quedan para una autorización separada.

**Resuelto en "Corrección transitiva"**: actualizados a `fast-uri` 3.1.9 e `ip-address` 10.7.6 con la spec `template-v2-dependency-security-transitive.md`.

## Revalidación de cierre (2026-11-07)

Sobre el mismo árbol de trabajo, sin cambios en dependencias:

| Comprobación | Resultado |
|---|---|
| `npm audit --omit=dev` | 0 vulnerabilidades |
| `npm audit` | 15 (13 moderadas, 2 bajas), 0 críticas, 0 altas |
| `npx vitest run .claude/hooks` | 47/47 PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS, Next.js 16.4.5 |
| Firma de la spec (`ssh-keygen -Y verify`) | `Good "spec-approval" signature`, hash `57006327…`, fase A |
| `git diff main` sobre gobierno (`.claude`, `CLAUDE.md`, `AGENTS.md`, `docs/SETUP.md`, spec de Fase B y su `.sig`, `.gitattributes`, `.mcp.json`) | Vacío |

## Seguridad del lockfile

- Los 730 `resolved` apuntan a `registry.npmjs.org`. Las 6 entradas sin `resolved` son `inBundle` de `@tailwindcss/oxide-wasm32-wasi` y ya estaban así en `main`.
- Paquetes nuevos en el lockfile, todos de desarrollo y traídos por `shadcn` 4.23.0:
  - `@modelcontextprotocol/core` 2.4.0;
  - `@modelcontextprotocol/server` 2.4.0, que sustituyen al SDK MCP 1.x;
  - `@shadcn/registry` 0.2.1;
  - `type-fest` 4.41.0.

## Requisito del entorno de build

`shadcn` está en `devDependencies`, pero `app/globals.css` importa `shadcn/tailwind.css` al compilar. El entorno de build tiene que instalar las `devDependencies`. `npm ci` y Vercel lo hacen por defecto. Un build con `npm ci --omit=dev` o `NODE_ENV=production npm ci` fallaría. El runtime (`next start`) no necesita el paquete.

## Corrección transitiva

- Spec: `template-v2-dependency-security-transitive.md` (Fase A, T1–T2)
- Fecha: 2026-11-07 · Node 26.12.1 · npm 11.20.0 · Windows 11 (win32-x64)
- Comandos: `npm update fast-uri ip-address --ignore-scripts`, después `npm ci --ignore-scripts`. Los dos terminaron con código 0. Sin `--force`, `overrides`, `.npmrc` ni `npm audit fix`.

### Hashes antes de tocar nada (requisito 0)

| Archivo | SHA-256 |
|---|---|
| `package-lock.json` | `aae8de024bb5eaa1d963025ee5c9db2f97322a2720f3509c147dc47a42794a10` |
| `$TEMP/template-v2-deps/package-lock.before-transitive.json` (copia) | `aae8de024bb5eaa1d963025ee5c9db2f97322a2720f3509c147dc47a42794a10` (coincide) |
| `package.json` | `85026c46ede56b57988a7ba9fe00c6ad558001f6064e6ceb2eb20b043c6a22c6` |

`package-lock.json` después: `1e658f91dfa2727da3760dba5b2dd51b5c61e993d6d553c8298d18eefe150b95`. La copia se conserva hasta el commit.

### Versiones

| Paquete | Antes | Después | Ruta |
|---|---|---|---|
| `fast-uri` | 3.1.8 | 3.1.9 | `shadcn` → `@dotenvx/dotenvx` → `conf` → `ajv` |
| `ip-address` | 10.7.2 | 10.7.6 | `shadcn` → `socks` |

### `npm audit`

| | Total | Crítica | Alta | Moderada | Baja |
|---|---|---|---|---|---|
| `npm audit` antes | 15 | 0 | 0 | 13 | 2 |
| `npm audit` después | 13 | 0 | 0 | 11 | 2 |
| `npm audit --omit=dev` antes | **0** | 0 | 0 | 0 | 0 |
| `npm audit --omit=dev` después | **0** | 0 | 0 | 0 | 0 |

Después solo quedan dos avisos de origen: `minimatch` (GHSA-g3hv-75wg-m249) y `deepmerge` (GHSA-gcqx-w48m-w2h4), los residuales ya aceptados. Las otras 11 entradas son paquetes que los arrastran. Desaparecen los avisos de `fast-uri` (GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp) y de `ip-address` (GHSA-rxp7-6hxx-x8q5). Con esto, las filas de `fast-uri` e `ip-address` de "Residuales" y la sección "Actualizaciones compatibles pendientes" quedan resueltas.

### Lockfile (requisitos 3 y 4)

`git diff --no-index --stat "$TEMP/template-v2-deps/package-lock.before-transitive.json" package-lock.json`: `1 file changed, 6 insertions(+), 6 deletions(-)`. Solo cambian `version`, `resolved` e `integrity` de `node_modules/fast-uri` y `node_modules/ip-address`:

```diff
     "node_modules/fast-uri": {
-      "version": "3.1.8",
-      "resolved": "https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.8.tgz",
-      "integrity": "sha512-GZMtZUTNRpOVIECoXwLNZS5xUGE+mVNbTB8h/7Rwh2TFWcBQiPzTgyZi05BF9UMZKkLJv8XBRJTlU7zg8+ZfMg==",
+      "version": "3.1.9",
+      "resolved": "https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.9.tgz",
+      "integrity": "sha512-hS/0Wt3Ya043oKXs0sIxrMpKQITXhMLIrVAKKXi4gozGC9v7YRWVnXIZzjNPTO02M9BdxLCWqK1yRXgNziVyJQ==",
     "node_modules/ip-address": {
-      "version": "10.7.2",
-      "resolved": "https://registry.npmjs.org/ip-address/-/ip-address-10.7.2.tgz",
-      "integrity": "sha512-7H/2gFSIitxc0hG3nOI1glS8QLo/EHBFFLk8vEUjXY/xu0AdL8jZ9U1IzO2PUm0d2D/ofQcAifb0g6OBkt8U7w==",
+      "version": "10.7.6",
+      "resolved": "https://registry.npmjs.org/ip-address/-/ip-address-10.7.6.tgz",
+      "integrity": "sha512-00LYkM6byILa9eQIx6qoaXCM40xTLd56AZ4vyaPW3YTyb49VZYPo5xsiAq4tuQ54GH4R7gVdYScJ1B7B77PuTg==",
```

Los dos `resolved` apuntan a `registry.npmjs.org`. El lockfile sigue con 736 paquetes y sus 730 `resolved` apuntan a `registry.npmjs.org`. Ningún paquete nuevo. No hizo falta rollback.

### Criterios de aceptación

| Criterio | Resultado |
|---|---|
| `npm ls fast-uri ip-address` | PASS: `fast-uri@3.1.9`, `ip-address@10.7.6` |
| `npm audit` sin críticas, altas, `fast-uri` ni `ip-address` | PASS: 13 (11 moderadas, 2 bajas); solo `minimatch` y `deepmerge` |
| `npm audit --omit=dev` | PASS: `found 0 vulnerabilities` |
| `npx vitest run .claude/hooks` | PASS: 47/47 |
| `npm run lint` | PASS (código 0, sin avisos) |
| `npm run build` | PASS (código 0); `/` y `/_not-found` estáticas. `AGENTS.md` no se reescribió |
| `npx shadcn --help` | PASS (código 0) |
| Lockfile frente a la copia | PASS: 6 líneas añadidas y 6 quitadas, solo en esas dos entradas |
| SHA-256 de `package.json` | PASS: `85026c46…a22c6`, igual al del requisito 0 |
| Otros archivos | Solo cambia este documento, además de los artefactos de aprobación de la spec |
| `git diff main --stat -- .claude CLAUDE.md AGENTS.md docs/SETUP.md` | PASS: vacío. La comprobación sobre las specs queda para el reviewer |
