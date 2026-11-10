# CI: validación de PRs hacia main

- Módulo: ci
- Estado: aprobado
- ID: SPEC-ci-pr-checks
- Riesgo: medio (CI/CD es disparador; el workflow no usa secretos, no despliega ni toca datos, y se revierte borrando un archivo)
- Ruta: SDD-ADVANCED (disparador: infraestructura, CI/CD)
- Fase actual: Fase 1

## Objetivo

Hoy nada valida automáticamente los PRs hacia `main`. Se añade un workflow mínimo de GitHub Actions que ejecuta instalación, lint, tests y build para que el propietario y el reviewer vean un resultado objetivo en cada PR.

## Alcance y reglas

- Incluye:
  - Un único archivo nuevo: `.github/workflows/ci.yml`.
  - Disparador `pull_request` con `branches: [main]` (sin `pull_request_target`).
  - Un job con: checkout, `actions/setup-node` (Node 22, cache npm), `npm ci --ignore-scripts`, `npm run lint`, `npx vitest run`, `npm run build`.
  - `permissions: contents: read`, `concurrency` con cancelación, `timeout-minutes` en el job.
- No incluye:
  - Script `typecheck` ni paso de tipos aparte (ver decisión D1).
  - Variables de entorno, secretos ni valores dummy de Clerk/Neon (ver D3).
  - `DISPOSABLE_DATABASE_URL` ni ninguna base de datos (ver RN-05).
  - Despliegues, migraciones, `db:*`, `npm audit`, cobertura, matriz de versiones de Node, E2E, caché de `.next`, Dependabot, badges.
  - Disparador `push` a `main` (no pedido; YAGNI).
  - Protección de rama de `main` / checks requeridos: decisión posterior del propietario (ver preguntas abiertas).
  - Cambios en `package.json`, dependencias, hooks, agentes o archivos de gobierno.
- RN-01: El workflow solo se dispara por `pull_request` hacia `main`; nunca por `pull_request_target`.
- RN-02: El workflow no define ni referencia `secrets.*`, ni credenciales, ni `DATABASE_URL`, claves de Clerk u otras variables de entorno del proyecto.
- RN-03: Permisos del `GITHUB_TOKEN` limitados a `contents: read`; el checkout no persiste credenciales (`persist-credentials: false`).
- RN-04: Las dependencias salen exactamente de `package-lock.json` (`npm ci`), sin ejecutar scripts de instalación (`--ignore-scripts`).
- RN-05: Los tests se ejecutan con `npx vitest run` sin `DISPOSABLE_DATABASE_URL`; los de integración se omiten.
- RN-06: Un fallo de lint, tests o build hace fallar el job y por tanto el check del PR; los pasos se ejecutan en ese orden y el job se detiene en el primer fallo.
- RN-07: Una nueva ejecución sobre el mismo PR cancela la anterior en curso; el job tiene un límite de tiempo.

## Actores y matriz de acceso

| Actor o rol | Recurso o acción | Permitido | Condición |
|---|---|---|---|
| Autor de PR (mismo repo) | Dispara el workflow | Sí | PR hacia `main` |
| Autor de PR desde fork | Dispara el workflow | Sí, sin secretos | `pull_request` no entrega secretos a forks |
| Workflow | Leer el código del repo | Sí | `contents: read` |
| Workflow | Escribir en el repo, PRs, issues, paquetes | No | Permisos mínimos |
| Workflow | Acceder a Clerk, Neon o producción | No | Sin variables ni secretos |

## Diseño y dependencias

- Archivo: `.github/workflows/ci.yml`, nuevo (no existe `.github/`; es el único artefacto que introduce CI).
- Estructura prevista (referencia, el developer puede ajustar sintaxis sin cambiar el comportamiento):

```yaml
name: CI
on:
  pull_request:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  checks:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<tag mayor>
        with:
          persist-credentials: false
      - uses: actions/setup-node@<tag mayor>
        with:
          node-version: 22
          cache: npm
      - run: npm ci --ignore-scripts
      - run: npm run lint
      - run: npx vitest run
      - run: npm run build
```

- Dependencias externas: solo las acciones oficiales `actions/checkout` y `actions/setup-node` (propiedad de GitHub). Sin acciones de terceros.
- Decisiones con evidencia (medidas el 2026-11-09 en este checkout, `main` + rama `feat/ci-pr-checks`, sin variables de entorno de Clerk/Neon, Node v26 local):
  - **D1 Typecheck:** no se añade script `typecheck`. `npm run build` ejecuta "Running TypeScript" (observado) y `tsconfig.json` incluye `**/*.ts`, `**/*.tsx` y `**/*.mts`, es decir, también los tests y las configs. Un `tsc --noEmit` aparte duplicaría la comprobación y exigiría tocar `package.json`. Se reevalúa si el build deja de tipar todo o se quiere feedback de tipos antes del build.
  - **D2 Instalación sin scripts:** `npm ci --ignore-scripts` seguido de lint, vitest y build pasó localmente (lint sin salida y código 0; vitest 16 archivos pasan, 1 omitido, 514 tests pasan, 7 omitidos; build compilado, tipado y 8 páginas generadas). El único script de instalación relevante (`unrs-resolver`, ver `docs/specs/template-v2-dependency-security.md`) no hace falta.
  - **D3 Variables de entorno:** el build pasa sin `CLERK_*` ni `DATABASE_URL` (todas las rutas son dinámicas excepto `/_not-found`, y `getDb()` valida la URL en tiempo de ejecución, no al importar). Por tanto no se definen valores dummy. Si un cambio futuro exige variables en build, el job fallará de forma visible y se añadirá entonces un valor dummy no secreto en una spec propia.
  - **D4 Acciones por tag mayor, no por SHA:** se usa tag mayor (`@vN`) para las dos acciones oficiales de GitHub. Riesgo aceptado: un tag mayor puede moverse (compromiso de la acción o cambio de comportamiento); se mitiga porque son acciones de GitHub, el token es de solo lectura y no hay secretos que robar. Fijar por SHA es más estricto pero exige mantenimiento manual sin Dependabot (fuera de alcance). El developer verifica el tag mayor vigente de cada acción en su repositorio oficial antes de escribir el archivo. Decisión reversible; ver pregunta abierta Q1.
  - **D5 Node 22:** el repo no declara `engines`. Se fija `22` (línea LTS soportada por Next 16 y vitest 5/vite 8); localmente corre con Node v26 y pasa. La diferencia 22 vs. v26 es riesgo residual pequeño y se valida en el PR.
  - **D6 Timeout:** 15 minutos. Local, todo el flujo tarda menos de 2 minutos (vitest ~40 s, build ~15 s); el margen cubre la instalación en frío y runners más lentos.

## Contratos y datos

No aplica contrato de API ni datos. Contrato del workflow: un check llamado `CI / checks` por PR, verde si los cuatro pasos de verificación terminan con código 0 y rojo en caso contrario.

## No funcionales

- Duración esperada del job: pocos minutos; cache npm de `setup-node` reduce la instalación.
- Privacidad: sin secretos ni datos reales; los logs de Actions no contienen credenciales porque no existen.
- Sin auditoría adicional: el historial de ejecuciones de Actions es suficiente.

## Fallos, seguridad y recuperación

| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| Lint, test o build fallan | Check rojo en el PR | El autor corrige y empuja; concurrency cancela la ejecución previa | Nuevo push |
| Acción de GitHub comprometida o tag movido (D4) | No se detecta automáticamente | Token de solo lectura, sin secretos ni escritura | Pasar a SHA fijados; revertir el archivo |
| Workflow mal configurado (sintaxis) | El check no aparece o falla al inicio en el PR | Corregir YAML | Revertir el archivo (`git revert` del commit o borrar `.github/workflows/ci.yml`) |
| PR de fork con código hostil | Ninguna | Sin secretos ni permisos de escritura; `pull_request` (no `_target`) | No requiere |
| Job colgado | `timeout-minutes: 15` | Se cancela solo | Reejecutar |
| Variables de entorno requeridas en el build en el futuro (D3) | Build rojo con mensaje explícito | Spec nueva con valores dummy no secretos | Revertir el cambio que introdujo la dependencia |

Rollback: eliminar `.github/workflows/ci.yml`. No hay migraciones, datos ni estado externo que revertir.

## Criterios de aceptación

- [ ] AC-01 (RN-01) Dado `.github/workflows/ci.yml`, cuando se inspecciona `on:`, entonces contiene solo `pull_request` con `branches: [main]` y no aparece `pull_request_target`, `push` ni `workflow_dispatch`.
- [ ] AC-02 (RN-02, negativo) Dado el archivo, cuando se busca `secrets.`, `DATABASE_URL`, `CLERK` y `DISPOSABLE_DATABASE_URL`, entonces no hay coincidencias y no existe bloque `env:` con credenciales.
- [ ] AC-03 (RN-03) Dado el archivo, entonces declara `permissions: contents: read` a nivel de workflow (o job), sin otros permisos, y `actions/checkout` usa `persist-credentials: false`.
- [ ] AC-04 (RN-04) Dado el job, entonces `setup-node` usa `node-version: 22` y `cache: npm`, y la instalación es exactamente `npm ci --ignore-scripts`.
- [ ] AC-05 (RN-06) Dado el job, entonces ejecuta en este orden `npm run lint`, `npx vitest run` y `npm run build`, cada uno como paso propio, sin `continue-on-error`.
- [ ] AC-06 (RN-07) Dado el archivo, entonces define `concurrency` con `cancel-in-progress: true` agrupada por workflow y ref, y `timeout-minutes` en el job.
- [ ] AC-07 (RN-05) Dado un entorno sin `DISPOSABLE_DATABASE_URL`, cuando se ejecuta `npx vitest run`, entonces el archivo `modules/account/services/profile.service.integrity.test.ts` se reporta como omitido (`describe.skipIf(!disposableUrl)`) y el resto pasa con código 0.
- [ ] AC-08 (D1, D3) Dado un entorno sin variables de Clerk/Neon, cuando se ejecuta `npm run build`, entonces termina con código 0 e incluye la fase de TypeScript.
- [ ] AC-09 (RN-06, éxito) Dado un PR hacia `main` sin errores, cuando corre el workflow, entonces los pasos lint, tests y build terminan con código 0 y el check `CI / checks` queda verde. Verificación: en el PR real.
- [ ] AC-10 (RN-06, negativo lint) Dado un PR con un error de ESLint, cuando corre el workflow, entonces el paso `npm run lint` falla, el check queda rojo y no se ejecutan tests ni build. Verificación local: `npm run lint` devuelve código distinto de 0 con ese cambio; en el PR: opcionalmente con un commit de prueba descartable.
- [ ] AC-11 (RN-06, negativo test) Dado un PR con un test fallando, cuando corre el workflow, entonces `npx vitest run` falla y el check queda rojo. Verificación equivalente a AC-10.
- [ ] AC-12 (RN-06, negativo build) Dado un PR con un error de tipos, cuando corre el workflow, entonces `npm run build` falla en "Running TypeScript" y el check queda rojo. Verificación equivalente a AC-10.
- [ ] AC-13 (alcance) Dado el diff de la fase, entonces el único archivo cambiado fuera de `docs/specs/ci-pr-checks.md` es `.github/workflows/ci.yml`; `package.json`, `package-lock.json`, `.claude/` y `docs/SETUP.md` no cambian.

## Trazabilidad

| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | `on:` del workflow | AC-01 | Inspección del archivo (reviewer) |
| RN-02 | Archivo completo | AC-02 | Búsqueda de texto (reviewer) |
| RN-03 | `permissions`, checkout | AC-03 | Inspección del archivo |
| RN-04 | Pasos setup-node e instalación | AC-04 | Inspección + `npm ci --ignore-scripts` local |
| RN-05 | Pruebas de integridad existentes | AC-07 | `npx vitest run` local sin la variable (ya existente: `profile.service.integrity.test.ts`) |
| RN-06 | Orden de pasos | AC-05, AC-09, AC-10, AC-11, AC-12 | Locales + ejecución del PR |
| RN-07 | `concurrency`, `timeout-minutes` | AC-06 | Inspección del archivo |

No se escriben tests unitarios nuevos: un archivo YAML sin lógica no los requiere según `docs/SETUP.md` ("Unit testing"). La verificación es la ejecución real de los mismos comandos.

## Matriz de pruebas

| Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Workflow de CI (infraestructura) | No aplica (sin lógica) | No (los de BD siguen omitidos, AC-07) | Local: `npm ci --ignore-scripts`, `npm run lint`, `npx vitest run`, `npm run build` con los mismos comandos y sin variables; PR: ejecución real del workflow | Revisión de AC-01, AC-02, AC-03 (sin `pull_request_target`, sin secretos, permisos mínimos) | Rollback: borrar el archivo; sin migraciones |

Qué se verifica localmente y qué queda para el PR:
- Local (antes del PR): los cuatro comandos devuelven código 0 sin variables de entorno (ya observado al redactar la spec); inspección del YAML contra AC-01 a AC-06 y AC-13. Opcionalmente un validador de sintaxis YAML si ya está disponible; no se instala nada.
- Solo en el PR: que GitHub acepte el YAML, que el check `CI / checks` aparezca y quede verde (AC-09), la diferencia Node 22 vs. local, el comportamiento de `concurrency` y la resolución de los tags mayores. Si algo de esto no se pudo ejecutar, el reviewer lo marca NO EJECUTADO con su motivo.

## Archivos sensibles

- `.github/workflows/ci.yml`

## Plan de tareas

### Fase 1
- [x] T1 — Verificar el tag mayor vigente de `actions/checkout` y `actions/setup-node` en sus repositorios oficiales y crear el workflow según el diseño · archivos: `.github/workflows/ci.yml` · depende de: — · secuencial (base)
- [x] T2 — Verificación local: `npm ci --ignore-scripts`, `npm run lint`, `npx vitest run` y `npm run build` sin variables de Clerk/Neon ni `DISPOSABLE_DATABASE_URL`; comprobar AC-01 a AC-08 y AC-13 sobre el archivo y registrar resultados en el informe (sin crear archivos) · archivos: ninguno · depende de: T1 · secuencial

Nota: ambas tareas son secuenciales (un solo archivo; T2 verifica lo que crea T1). Una fase, 2 tareas, 1 archivo.

## Preguntas abiertas

- Q1: Se propone tag mayor para las acciones oficiales (D4). ¿Se prefiere fijar por SHA completo desde el inicio, aceptando el mantenimiento manual?
- Q2: Protección de `main` (exigir el check `CI / checks` antes de fusionar): queda fuera de esta spec; decisión posterior del propietario una vez que el check exista y sea estable.
- Q3: ¿Se quiere también ejecutar el workflow en `push` a `main` para detectar roturas tras fusionar? No incluido (YAGNI).
- Q4: El repo no declara `engines`. ¿Se desea fijar la versión de Node del proyecto (p. ej. `.nvmrc` o `engines`) en una spec aparte para alinear local y CI?

## Definition of Done

AC de la fase con evidencia en el veredicto del reviewer; lo no ejecutado de la matriz (ejecución real del workflow en GitHub, AC-09 a AC-12 en el PR) figura como NO EJECUTADO con su motivo hasta abrir el PR.
