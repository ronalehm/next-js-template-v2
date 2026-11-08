# Corrección de dependencias transitivas: `fast-uri` e `ip-address`

- Módulo: template (base)
- Ruta: SDD-ADVANCED (disparador: dependencias críticas)
- Estado: aprobado
- Fase actual: A
- Rama: `fix/deps-security`, sobre los cambios de `docs/specs/template-v2-dependency-security.md`, que no se modifican. `main` no se toca.

## Objetivo

Cerrar las dos vulnerabilidades transitivas que tienen corrección dentro de sus rangos y que quedaron pendientes en `docs/evidence/template-v2-dependency-security.md`.

## Diagnóstico

| Paquete | Actual | Corregido | Aviso | Entra por | Runtime |
|---|---|---|---|---|---|
| `fast-uri` | 3.1.8 | 3.1.9 | GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp | `shadcn` → `@dotenvx/dotenvx` → `conf` → `ajv` (`^3.0.1`) | No (dev) |
| `ip-address` | 10.7.2 | 10.7.6 | GHSA-rxp7-6hxx-x8q5 | `shadcn` → `socks` (`^10.1.1`) | No (dev) |

**Simulación** sobre una copia del `package-lock.json` actual de la rama, fuera del repo. Comando: `npm update fast-uri ip-address --package-lock-only --ignore-scripts`. Resultado:

- `package.json` no cambia.
- `package-lock.json` cambia en 6 líneas añadidas y 6 quitadas. Solo cambian dos entradas, `node_modules/fast-uri` y `node_modules/ip-address`, en `version`, `resolved` e `integrity`.
- `npm audit`: de 15 a 13 entradas (11 moderadas, 2 bajas). Quedan solo `minimatch` y `deepmerge`, residuales ya aceptados.
- `npm audit --omit=dev`: sigue en 0.

## Alcance

- Incluye:
  - las entradas `node_modules/fast-uri` y `node_modules/ip-address` de `package-lock.json`;
  - una sección nueva en `docs/evidence/template-v2-dependency-security.md`.
- No incluye:
  - `package.json`;
  - versiones directas ya aprobadas;
  - otras entradas del lockfile;
  - `overrides`;
  - `npm audit fix` y `--force`;
  - `.npmrc`;
  - `AGENTS.md` y cualquier otro archivo de gobierno;
  - la spec aprobada `template-v2-dependency-security.md` y su `.sig`;
  - `minimatch` y `deepmerge`.

## Requisitos

0. Antes de tocar nada, copiar el lockfile actual fuera del repo y anotar su SHA-256 en la evidencia. El lockfile actual incluye las actualizaciones de la primera spec, que aún no tienen commit.
   - Comando: `mkdir -p "$TEMP/template-v2-deps" && cp package-lock.json "$TEMP/template-v2-deps/package-lock.before-transitive.json" && sha256sum package-lock.json "$TEMP/template-v2-deps/package-lock.before-transitive.json"`.
   - Los dos hashes deben coincidir.
   - Anotar también el SHA-256 de `package.json`.
1. Ejecutar exactamente `npm update fast-uri ip-address --ignore-scripts`.
2. Después, `npm ci --ignore-scripts`.
3. Comparar el lockfile con su estado inmediatamente anterior, no con `main`, con `git diff --no-index "$TEMP/template-v2-deps/package-lock.before-transitive.json" package-lock.json`.
   - Solo pueden cambiar `version`, `resolved` e `integrity` de esas dos entradas.
   - Si cambia cualquier otra cosa, se aplica el rollback de esta spec y se detiene.
4. `resolved` debe apuntar a `registry.npmjs.org`.

## Criterios de aceptación

- [ ] `npm ls fast-uri ip-address` muestra `fast-uri@3.1.9` e `ip-address@10.7.6`.
- [ ] `npm audit` sin críticas ni altas, y sin avisos de `fast-uri` ni de `ip-address`.
- [ ] `npm audit --omit=dev` con 0 vulnerabilidades.
- [ ] `npx vitest run .claude/hooks` 47/47.
- [ ] `npm run lint` y `npm run build` en PASS.
- [ ] `npx shadcn --help` funciona: los dos paquetes pertenecen a su CLI.
- [ ] Frente al estado inmediatamente anterior a esta corrección, no frente a `main`:
  - `git diff --no-index --stat "$TEMP/template-v2-deps/package-lock.before-transitive.json" package-lock.json` da 6 líneas añadidas y 6 quitadas, solo en esas dos entradas;
  - `package.json` mantiene el SHA-256 anotado en el requisito 0;
  - aparte de los artefactos de aprobación de esta spec (spec, `.sig` y `approvals.jsonl`), solo cambia `docs/evidence/template-v2-dependency-security.md`.
- [ ] Gobierno intacto: `git diff main -- .claude CLAUDE.md AGENTS.md docs/SETUP.md docs/specs/template-v2-professional-workflow.md*` vacío.

## Diseño técnico

Sin cambios de código. La prueba manual en el navegador no se repite: los dos paquetes solo los usa el CLI de `shadcn`, no el build ni el runtime de la app, y la evidencia ya registra el PASS de la prueba anterior.

## Seguridad

- Con `--ignore-scripts`.
- Ningún paquete nuevo en el lockfile.

## Rollback

No usar `git restore package-lock.json`: devolvería el lockfile al de `main` y perdería las actualizaciones aprobadas de la primera spec, que aún no tienen commit.

1. `cp "$TEMP/template-v2-deps/package-lock.before-transitive.json" package-lock.json`.
2. Comprobar que el SHA-256 coincide con el anotado en el requisito 0.
3. `npm ci --ignore-scripts`.

La copia se conserva hasta que el usuario haga el commit.

## Archivos sensibles

(no aplica)

## Cambios de gobierno

(no aplica)

## Tests

No se añaden: no hay código nuevo. La regresión son los criterios anteriores.

## Plan de tareas

### Fase A

- [ ] T1 — Requisitos 0 a 4 y criterios de aceptación · archivos: `package-lock.json` · depende de: — · secuencial
- [ ] T2 — Añadir la sección "Corrección transitiva" a la evidencia con versiones, `npm audit` antes y después, y resultados · archivos: `docs/evidence/template-v2-dependency-security.md` · depende de: T1 · secuencial
- [ ] T3 — Revisión de `reviewer` contra esta spec · archivos: — · depende de: T2
