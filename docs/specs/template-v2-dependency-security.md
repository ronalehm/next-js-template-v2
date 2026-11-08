# Remediación de vulnerabilidades en dependencias

- Módulo: template (base)
- Ruta: SDD-ADVANCED (disparador: dependencias críticas)
- Estado: aprobado
- Fase actual: A
- Rama: `fix/deps-security` desde `main` `51c9fba`. `main` no se modifica.

## Objetivo

Eliminar las vulnerabilidades críticas y altas de las dependencias de la plantilla con el cambio mínimo compatible, sin tocar los controles de gobierno ni el comportamiento de la aplicación.

## Diagnóstico (2026-11-07, `npm audit` sobre `main` `51c9fba`)

Estado inicial: 23 vulnerabilidades en total (1 crítica, 8 altas, 13 moderadas, 1 baja). Con `--omit=dev`: 15 (1 crítica, 7 altas, 6 moderadas, 1 baja).

| Paquete instalado | Severidad | Entra por | Afecta en runtime | Corrección |
|---|---|---|---|---|
| `next` 16.3.8 | crítica | directa | Sí: servidor de la app. GHSA-2464-fhr4-w9xw y GHSA-673q-mjm6-r5xr (RCE), GHSA-p3m5-59mp-jv5r (DoS por Server Actions) | `next` 16.4.5, con `eslint-config-next` 16.4.5 |
| `zod` 4.6.5 | alta | directa | Sí, cuando se use para validar entrada. GHSA-mrhx-c7xc-m3w5 (memoria) | `^4.6.7` |
| `follow-redirects` 1.16.0 | alta | `axios` 1.20.0 | Sí, si `axios` se usa en el servidor. GHSA-q3jh-wrc6-jgq8, GHSA-8r9p-f939-6h3c, GHSA-mrwp-f3q8-3g9p | 1.16.2 en el lockfile, dentro del rango `^1.16.0` de `axios` |
| `@modelcontextprotocol/sdk` 1.31.0, `body-parser` 2.3.0, `qs`, `ip-address`, `fast-uri`, `undici`, `systeminformation`, `deepmerge`, `ts-morph`/`minimatch` | alta y moderada | `shadcn` 4.21.0 (CLI) | No. La app solo importa `shadcn/tailwind.css` en `app/globals.css`, que se procesa al compilar. El resto es el CLI y su servidor MCP | `shadcn` `^4.23.0`, que ya no trae `express` ni el SDK MCP 1.x, y moverlo a `devDependencies` |
| `undici` 7.30.0 | alta | `jsdom` (tests) y `shadcn` | No | 7.30.2 en el lockfile, dentro de los rangos |
| `vite` 8.3.1 | alta | `vitest` (tests) | No. Servidor de desarrollo local | 8.3.6 en el lockfile, dentro del rango peer |
| `minimatch` 10.x | moderada | `typescript-eslint` (lint) y `ts-morph` (CLI de `shadcn`) | No | Existe versión corregida (11.0.1), pero los paquetes que la usan piden `^10` y no está confirmado que la 11 sea compatible con ellos. No se fuerza con `overrides`. `npm audit` solo propone bajar de versión mayor. Riesgo residual de desarrollo |
| `deepmerge` 4.3.1 | baja | `shadcn` (CLI) | No | Sin versión corregida publicada. Riesgo residual de desarrollo |

**`unrs-resolver` 1.12.2** (dev, vía `eslint-config-next` → `eslint-import-resolver-typescript`): su `postinstall` ejecuta `napi-postinstall`. Comprueba que el binario nativo de la plataforma (`@unrs/resolver-binding-*`) esté instalado. Ese binario ya llega como dependencia opcional fijada en el lockfile con `integrity`. Solo si falta, el script lo descarga del registro npm o ejecuta `npm install`. Es el único script de instalación del árbol junto con `fsevents` (macOS, opcional). No se aprueba ni se configura nada: la fase A comprueba si `npm ci --ignore-scripts` basta para que lint funcione.

**Simulación** (solo lockfile, en una copia fuera del repo, con `--ignore-scripts`). Aplicar los requisitos 1 a 4 da:
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm audit`: 13 entradas (11 moderadas, 2 bajas), 0 altas y 0 críticas. Todas vienen de dos avisos de herramientas de desarrollo:
  - `minimatch` GHSA-g3hv-75wg-m249: tiene corrección (11.0.1), pero no se ha confirmado que sea compatible con las dependencias que la usan;
  - `deepmerge` GHSA-gcqx-w48m-w2h4: sin parche publicado.
- Cambio del lockfile: unas 540 líneas añadidas y 1120 quitadas, sobre todo por la salida del árbol `express` y MCP de `shadcn`.

## Alcance

- Incluye:
  - `package.json` y `package-lock.json`;
  - validación de seguridad, regresión y gobierno;
  - registro de residuales;
  - una sección en `README.md` solo si se cumple el requisito 7.
- No incluye:
  - código de la app;
  - hooks, agentes, `settings.json`, `CLAUDE.md`, `AGENTS.md` y `docs/SETUP.md`;
  - la spec de Fase B;
  - `overrides` sobre dependencias de terceros, incluido `minimatch` 11;
  - `.npmrc` y cualquier regla obligatoria de instalación para los proyectos derivados;
  - cambios en `axios`, salvo los del lockfile del requisito 4;
  - `npm audit fix --force`;
  - actualizar paquetes sin aviso;
  - la Fase C, MADRE y V1.

## Requisitos

1. `next` y `eslint-config-next` pasan de `16.3.8` a `16.4.5`, con versión exacta, como ahora.
2. `zod` pasa de `^4.6.5` a `^4.6.7`.
3. `shadcn` pasa de `dependencies` `^4.21.0` a `devDependencies` `^4.23.0`.
4. Lockfile: `npm update` solo de `follow-redirects`, `undici`, `vite` y `systeminformation` dentro de sus rangos. No se cambia ningún otro rango de `package.json`.
5. Instalación con `npm ci --ignore-scripts`. Si lint o build fallan por el binario nativo, se informa y se detiene. No se autoriza el script sin una decisión del usuario.
6. Antes de tocar nada, leer en `node_modules/next/dist/docs/` las notas de la 16.4 y comprobar que no afecten a `app/`, `next.config.ts` ni `eslint.config.mjs`.
7. `npm ci --ignore-scripts` se documenta en `README.md` como procedimiento recomendado para esta plantilla solo si se cumplen tres condiciones: T2 confirma que la instalación termina, y lint, tests y build pasan con ella. No es una regla obligatoria para los proyectos derivados, ni se impone con `.npmrc`. Si falla, no se documenta y el motivo queda en la evidencia.
8. Mover `shadcn` a `devDependencies` no puede romper la plantilla:
   - el build debe resolver `@import "shadcn/tailwind.css"`;
   - `next start` debe servir `/` con los estilos aplicados;
   - la salida de `.next/server` no debe requerir el paquete `shadcn` en runtime.

   El despliegue previsto instala `devDependencies` para compilar. Es el comportamiento por defecto de `npm ci` y de Vercel. La evidencia lo registra como requisito del entorno de build.

## Criterios de aceptación

- [ ] `npm audit` y `npm audit --omit=dev` sin críticas ni altas.
- [ ] `npm audit --omit=dev` con 0 vulnerabilidades. Cualquier residual de runtime se registra con su justificación.
- [ ] Residuales de desarrollo listados en la evidencia con su GHSA, ruta y motivo: `minimatch` y `deepmerge`, o los que queden.
- [ ] `npx vitest run` en PASS, y `npx vitest run .claude/hooks` 47/47.
- [ ] `npm run lint` y `npm run build` en PASS.
- [ ] `npm run dev` sirve `/` sin errores en consola, en comprobación manual.
- [ ] `npm ls shadcn` lo muestra como `dev`, y `npx shadcn --help` funciona.
- [ ] El build resuelve `shadcn/tailwind.css`, y el CSS compilado de `.next/static` incluye sus reglas.
- [ ] `next start` sirve `/` con estilos.
- [ ] `grep -r "shadcn" .next/server` no encuentra ningún `require` ni `import` del paquete.
- [ ] `npm ci --ignore-scripts`: resultado registrado. `README.md` solo cambia si pasó.
- [ ] `git diff --stat main` solo muestra:
  - `package.json`;
  - `package-lock.json`;
  - `docs/evidence/template-v2-dependency-security.md`;
  - `README.md`, solo si se cumple el requisito 7.
- [ ] Gobierno intacto: `git diff main -- .claude CLAUDE.md AGENTS.md docs/SETUP.md docs/specs/template-v2-professional-workflow.md*` vacío.

## Diseño técnico

- Sin cambios de código, rutas, componentes ni contratos de API.
- `package.json`: los cambios de los requisitos 1 a 3.
- `package-lock.json`: el que regenera npm con `npm install --ignore-scripts` y después `npm update <lista> --ignore-scripts`.
- Evidencia nueva: `docs/evidence/template-v2-dependency-security.md`, con:
  - versiones antes y después;
  - salida resumida de `npm audit`;
  - tests, lint y build;
  - resultado de `--ignore-scripts`;
  - residuales.

## Seguridad

- Sin `--force` ni `overrides`, y sin bajar ninguna versión mayor.
- Los scripts de instalación no se ejecutan durante la remediación (`--ignore-scripts`).
- El lockfile solo resuelve desde `registry.npmjs.org`: se comprueba que ningún `resolved` apunte a otro host.
- Los paquetes nuevos que aparezcan en el lockfile se listan en la evidencia.

## Rollback

- Antes del merge: descartar la rama `fix/deps-security` y su worktree. `main` no cambia.
- Después del merge: `git revert -m 1 <merge-commit>` en una rama nueva, PR y después `npm ci`. Con autorización del usuario.
- Rollback local durante la fase: `git restore package.json package-lock.json` y `npm ci --ignore-scripts`.

## Archivos sensibles

(no aplica)

## Cambios de gobierno

(no aplica)

## Tests

No se añaden tests: no hay código nuevo. La regresión es la suite existente, más lint, build y la prueba manual de `dev`.

## Plan de tareas

### Fase A

- [ ] T1 — Leer las notas de Next 16.4 y aplicar los requisitos 1 a 4 · archivos: `package.json`, `package-lock.json` · depende de: — · secuencial (base)
- [ ] T2 — `npm ci --ignore-scripts`; audit, tests, hooks, lint y build; comprobaciones de `shadcn` del requisito 8; `next start`; `registry` · archivos: — · depende de: T1 · secuencial
- [ ] T3 — Escribir la evidencia con los resultados y los residuales. Si T2 confirmó `--ignore-scripts`, añadir la sección en `README.md` (requisito 7) · archivos: `docs/evidence/template-v2-dependency-security.md`, `README.md` (condicional) · depende de: T2 · secuencial
- [ ] T4 — Revisión de `reviewer` contra esta spec y el checklist de `docs/SETUP.md` · archivos: — · depende de: T3

## Decisiones del usuario

1. `minimatch` y `deepmerge` quedan como residuales de desarrollo, sin `overrides`.
2. `npm ci --ignore-scripts` se documenta solo en `README.md`, como recomendación condicionada al requisito 7.
3. `axios` se queda en 1.20.0. Solo se actualiza `follow-redirects` en el lockfile.
