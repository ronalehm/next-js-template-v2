# SEC-1: cabeceras HTTP, CSP en Report-Only, tests negativos de users y control de dependencias

- Módulo: security
- Estado: aprobado
- ID: SPEC-security-sec-1
- Riesgo: medio (toca `proxy.ts` y CI/CD, que son disparadores; no cambia lógica de negocio, no usa secretos y cada pieza se revierte borrando o restaurando su archivo)
- Ruta: SDD-ADVANCED (disparadores: autenticación/sesión por `proxy.ts`, infraestructura y CI/CD, dependencias)
- Fase actual: Fase 1

## Objetivo
Cerrar tres brechas de la auditoría de seguridad sin cambiar el comportamiento visible: (G1+G2) la app no envía ninguna cabecera de seguridad ni CSP; (T2) las server actions de `users` no tienen tests negativos propios; (G5) no hay control de dependencias vulnerables ni actualizaciones automáticas. Para el propietario y los admins de la plantilla.

## Alcance
- Incluye:
  - Cabeceras estáticas efectivas (enforcing) en `next.config.ts`: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Strict-Transport-Security` (solo con `NODE_ENV=production`), `Permissions-Policy`.
  - CSP solo en modo `Content-Security-Policy-Report-Only`, compatible con Clerk, sin forzar render dinámico. Criterios medibles para activarla en una spec posterior.
  - `modules/users/actions/users.actions.test.ts` con tests negativos.
  - Diagnóstico `npm audit --omit=dev`, `.github/dependabot.yml` y un job de auditoría en CI.
- No incluye (backlog, fuera de alcance): G4, G6, RLS en base de datos, rate limiting, SYNC-1, hooks SDD y cualquier cambio en `.claude/`, agentes, `docs/SETUP.md`, `CLAUDE.md`, `AGENTS.md`. No activa una CSP efectiva (`Content-Security-Policy`; Report-Only no bloquea nada y por tanto no cierra la protección CSP, ver Seguimiento), no añade endpoint de reportes (`report-to`/`report-uri`, decisión D12), no migra a render dinámico, no añade `experimental.sri`, no toca `app/layout.tsx` ni `THEME_INIT_SCRIPT`, no cambia `users.actions.ts` ni sus schemas, no corrige vulnerabilidades más allá de registrarlas (si el diagnóstico exige un fix, va en otra spec).

## Hechos verificados (evidencia de la auditoría y de las docs)
- `next.config.ts` está vacío; `proxy.ts` usa `clerkMiddleware` con matcher que cubre páginas y `/(api|trpc)`.
- `app/layout.tsx` inyecta `THEME_INIT_SCRIPT` inline en `<head>`. Una CSP efectiva sin `'unsafe-inline'` lo bloquearía salvo nonce o hash.
- Next 16 (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`): con nonce, todas las páginas deben renderizarse dinámicamente, se desactivan ISR y estáticos, y PPR es incompatible. Alternativas: CSP sin nonce con `'unsafe-inline'` vía `headers()` de `next.config`, o `experimental.sri` (experimental).
- Clerk (docs CSP, `@clerk/nextjs` >= 6.14): `clerkMiddleware(..., { contentSecurityPolicy: {} })` aplica una política preset; `{ strict: true }` genera nonce por request y exige render dinámico (`dynamic` en `ClerkProvider`, `connection()`). Directivas requeridas: `script-src` con el host FAPI, `challenges.cloudflare.com` y `*.protect.clerk.com`; `connect-src` con FAPI y `*.protect.clerk.com:*`; `img-src img.clerk.com`; `worker-src 'self' blob:`; `style-src 'unsafe-inline'`; `frame-src challenges.cloudflare.com *.protect.clerk.com`. Las docs de Clerk consultadas no cubren Report-Only.

## Decisiones
- D1 (cabeceras estáticas): se declaran en `next.config.ts` con `headers()` sobre `/(.*)`. Valores: `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `X-Frame-Options: DENY` (la app no debe enmarcarse; Clerk se embebe en nosotros, no al revés); `Strict-Transport-Security: max-age=31536000` sin `includeSubDomains` ni `preload` y solo cuando `NODE_ENV=production` (decisión D9; no se impone en dev). `NODE_ENV=production` no equivale a HTTPS real: `npm run start` local sirve HTTP aunque tenga `NODE_ENV=production`. El test de `next.config.ts` verifica solo la lógica por `NODE_ENV`; la verificación por `curl -I` exige un despliegue HTTPS real (preview/producción); `Permissions-Policy: camera=(), microphone=(), geolocation=()`. No rompen el renderizado estático. `headers()` omite HSTS si `NODE_ENV` no es `production`.
- D2 (CSP, esta fase solo Report-Only): se envía `Content-Security-Policy-Report-Only` sin nonce, para no perder render estático y para medir sin riesgo. El developer comprueba en los tipos reales de `@clerk/nextjs` instalados (si no hay `node_modules`, instalarlos es tarea suya) si `contentSecurityPolicy` admite `reportOnly`.
  - Camino A (si existe): opción en `clerkMiddleware` de `proxy.ts`, modo preset (`{}`), más `directives` para el origen propio. El preset debe quedar sin `strict`.
  - Camino B (si no existe; aceptado por el propietario, D11): cabecera `Content-Security-Policy-Report-Only` estática en `next.config.ts` con las directivas de Clerk listadas arriba, `'self'`, `'unsafe-inline'` en `script-src` y `style-src`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. En ese caso `proxy.ts` y su test no se modifican y T2 edita `next.config.ts` y `next.config.test.ts` (tras T1).
  - Las dos variantes mantienen `auth.protect()` en `/dashboard(.*)` intacto.
- D3 (tema inline): en Report-Only el script inline no rompe nada. Para la activación futura se evalúan: (a) nonce, que obliga a render dinámico en toda la app y descarta PPR; (b) hash sha256 de `THEME_INIT_SCRIPT`, que no basta por sí solo porque Next también inyecta scripts inline propios en páginas estáticas; (c) `'unsafe-inline'` en `script-src`, que conserva estático pero debilita la CSP; (d) `experimental.sri`, experimental. Decisión del propietario (D8): se mantiene render estático durante el diagnóstico; la spec de activación evaluará una CSP efectiva compatible con Next 16 + Clerk priorizando (b) hash y (d) SRI si son viables; `'unsafe-inline'` (c) no es solución definitiva, solo transitoria y justificada. Ni esta spec ni el camino B (que usa `'unsafe-inline'` solo para medir en Report-Only) activan nada.
- D4 (criterios para activar CSP efectiva, spec posterior): se activa solo si, tras al menos un despliegue de preview recorriendo sign-in, sign-up, `/dashboard`, `/dashboard/users` (invitar, editar, revocar), perfil y cambio de tema, con las DevTools abiertas: (1) 0 violaciones propias de la app en consola; (2) 0 violaciones de Clerk en el flujo de login incluido el reto Cloudflare; (3) cada violación restante tiene una directiva concreta propuesta y probada; (4) la medición se repite sin `'unsafe-inline'` en `script-src` y el camino de D3 se elige priorizando hash/SRI. Sin esto, sigue Report-Only. D4 no se rebaja: el recorrido D4 completo (con reto Cloudflare, en preview/despliegue y con registro de violaciones) es requisito obligatorio de la spec de activación; AC-05 en SEC-1 solo cubre el diagnóstico parcial (ver Seguimiento).
- D5 (qué es riesgo real en `npm audit`): una advisory exige acción si es `high` o `critical`, la dependencia es de producción (se audita con `--omit=dev`; diagnóstico inicial primero, D10) y el código vulnerable es alcanzable desde rutas del servidor o cliente de esta app (por ejemplo, `next`, `@clerk/nextjs`, `@neondatabase/serverless`, `zod`). Se acepta y se documenta (no bloquea) si la ruta vulnerable no se usa, si es solo de build o dev que llegó por transitividad, o si no hay fix publicado. `moderate` y `low` no bloquean. Antes de interpretar, el developer revisa los `overrides` de `package.json` y las specs `template-v2-dependency-security*.md` para no duplicar decisiones previas.
- D6 (control en CI, D10): job separado `audit` en `.github/workflows/ci.yml` que ejecuta `npm audit --omit=dev --audit-level=high` y vuelca el resultado al log y a `$GITHUB_STEP_SUMMARY`. Si el diagnóstico inicial da 0 high/critical, el job bloquea high/critical. Si da alguno, el developer documenta la remediación (paquete, ruta, fix o motivo de aceptación según D5) y solo puede añadir `continue-on-error: true` (comentario en el YAML, resumen sigue mostrando el resultado) como excepción temporal si registra, por cada high/critical, los cuatro datos: (1) hallazgo (paquete, advisory, severidad), (2) responsable, (3) plazo de resolución, (4) criterio explícito para eliminar `continue-on-error`. Sin esos cuatro datos no hay modo informativo: el developer reporta BLOQUEADO/pendiente al orquestador y no deja el job así. No hay excepciones indefinidas sin evaluación; el paso a bloqueante será una spec o cambio posterior. Sin permisos adicionales (`contents: read`).
- D7 (Dependabot): `.github/dependabot.yml` con ecosistemas `npm` y `github-actions`, `directory: "/"`, intervalo semanal, `open-pull-requests-limit: 5`, y agrupación de `minor`+`patch` para no inundar de PRs. Solo propone PRs; no hay automerge.

## Decisiones del propietario (resuelven las preguntas abiertas anteriores)
- D8 CSP efectiva futura: render estático durante el diagnóstico; después, evaluar CSP efectiva compatible con Next 16 + Clerk priorizando hash/SRI; `unsafe-inline` no es definitiva (ver D3).
- D9 HSTS: `max-age=31536000` sin `includeSubDomains` ni `preload`, solo con `NODE_ENV=production`; la validación por `curl -I` se hace en un despliegue HTTPS real (preview/producción), no con `npm run start` local. Si no hay ese entorno durante la fase, el resultado se registra `NO EJECUTADO` con justificación y la verificación HTTPS queda como requisito obligatorio previo a RELEASE-1 (ver Seguimiento).
- D10 `npm audit`: diagnóstico primero; bloquea high/critical con línea base limpia; si no, remediación documentada y `continue-on-error` visible solo con hallazgo, responsable, plazo y criterio de retirada registrados; si faltan, BLOQUEADO/pendiente (ver D5/D6).
- D11 Camino B aceptado si los tipos reales de Clerk no ofrecen Report-Only (ver D2).
- D12 Endpoint de reportes fuera de SEC-1; en su lugar, evidencia manual verificable (AC-05).

## Criterios de aceptación
- [ ] AC-01 Dado `NODE_ENV=production`, cuando se pide cualquier ruta, entonces `headers()` incluye las cinco cabeceras de D1 con los valores indicados, y dado otro `NODE_ENV` (dev/test), entonces no incluye `Strict-Transport-Security` y sí las otras cuatro; ambos casos cubiertos en el test de `next.config.ts` (lógica por `NODE_ENV`). Además, dado un despliegue HTTPS real (preview/producción), cuando se ejecuta `curl -I`, entonces la respuesta trae las cinco cabeceras; `npm run start` local con `NODE_ENV=production` no cuenta como HTTPS real. Si no existe entorno HTTPS durante la fase, esta verificación se registra `NO EJECUTADO` con justificación y queda como requisito obligatorio previo a RELEASE-1 (ver Seguimiento).
- [x] AC-02 Dado `npm run build`, cuando se compara la tabla de rutas con la de antes del cambio, entonces ninguna ruta pasa de estática a dinámica (render estático conservado).
- [x] AC-03 Dado el entorno con CSP Report-Only, cuando se carga cualquier página, entonces existe `Content-Security-Policy-Report-Only` y no existe `Content-Security-Policy` efectiva (nada se bloquea).
- [x] AC-04 Dado un usuario sin sesión, cuando entra a `/dashboard`, entonces sigue siendo redirigido a sign-in; y cuando entra a `/` y al flujo de sign-in, entonces Clerk carga y el login completo funciona como antes, con el tema claro/oscuro aplicado sin parpadeo.
- [x] AC-05 Dado el recorrido parcial en navegador sobre el commit del PR (login Clerk DEV, dashboard, usuarios en vista, perfil, configuración, estilos y tema oscuro; `npm run build` + `npm run start` local en DEV), cuando se anotan las violaciones de la consola, entonces se entrega al reviewer la lista (origen, directiva, contexto), como evidencia manual verificable (sin endpoint de reportes, D12), que contiene solo SEC-1-ADJ-01 (sonda `Function("")` de zod); y se declara que la medición fue parcial, con `'unsafe-inline'` en el preset de Clerk y sin sign-up, invitar/editar/revocar, reto Cloudflare ni preview; por tanto NO valida una CSP estricta ni el recorrido D4 completo. No se exige 0 violaciones.
- [x] AC-06 (negativo) Dado `users.actions.test.ts`, cuando `getActor()` devuelve `null` (sin sesión, o fila `revoked`/`invited` como ya cubre `lib/auth.test.ts`), entonces cada una de las 7 acciones devuelve `{ ok: false, error: "No se pudo completar la acción. Inténtalo de nuevo." }` y ningún servicio de `users.service` es llamado.
- [x] AC-07 (negativo) Dado un actor con rol `user` (`can` devuelve `false` para `users:manage`), cuando se invoca cualquier acción, entonces se devuelve el error genérico, `can` fue llamado con `("user","users:manage")` y ningún servicio fue llamado.
- [x] AC-08 (negativo) Dado un actor admin, cuando el input trae claves extra (`{ ...válido, extra: 1 }`, `userId`), id no uuid, id ajeno de otro formato, campos faltantes, `null`/string/`undefined`, o un rol fuera de `PANEL_ROLES` (`superadmin`), entonces se devuelve el error genérico y ningún servicio es llamado.
- [x] AC-09 Dado un actor admin e input válido, cuando se invoca cada acción, entonces el servicio recibe el actor de sesión y los datos parseados, `revalidatePath("/dashboard/users")` se llama en mutaciones y no en `getUserSessionsAction`; y si el servicio lanza un error que no es `UsersError`, la respuesta es el genérico sin filtrar el mensaje, con log solo de `code` y `message`.
- [x] AC-10 Dado un id uuid ajeno válido, cuando un admin lo envía, entonces la acción lo pasa tal cual al servicio junto al actor de sesión (la comprobación de pertenencia es del servicio, ya cubierta en `users.service.test.ts`); el test documenta este límite.
- [x] AC-11 Dado `npm audit --omit=dev` ejecutado por el developer, cuando se completa, entonces el resultado (conteo por severidad y lista de high/critical con paquete, advisory, severidad, ruta, decisión D5 y remediación documentada) queda registrado en el informe del developer al reviewer, antes de fijar el modo del job; y si hay high/critical que justifiquen `continue-on-error`, el informe incluye además responsable, plazo y criterio de retirada (D6), o el developer reporta BLOQUEADO/pendiente.
- [x] AC-12 Dado `.github/dependabot.yml`, cuando se valida su sintaxis, entonces declara `npm` y `github-actions` según D7 y el YAML es válido.
- [x] AC-13 Dado `ci.yml`, cuando corre en un PR, entonces el job `audit` existe con el comando de D6, bloquea high/critical si la línea base es limpia o, si no, lleva `continue-on-error: true` con comentario y su resultado sigue visible en log/summary, solo si constan hallazgo, responsable, plazo y criterio de retirada (D6; de lo contrario el job no puede quedar informativo y la tarea es BLOQUEADO/pendiente); `permissions` sigue en `contents: read` y los jobs existentes (lint, vitest, build) no cambian.
- [x] AC-14 Dado el repositorio, cuando se ejecuta `npm run lint`, `npx vitest run` y `npm run build`, entonces los tres pasan.

## Diseño técnico
- Rutas (app/): ninguna nueva ni modificada.
- Componentes: ninguno nuevo; no hay UI. No aplica shadcn.
- Capas:
  - `next.config.ts`: existente (raíz), se modifica para `headers()`.
  - `next.config.test.ts`: nuevo, junto al archivo que prueba. El developer confirma que Vitest lo recoge (la configuración no define `include`, usa el patrón por defecto).
  - `proxy.ts`: existente; se modifica solo en el camino A de D2.
  - `proxy.test.ts`: nuevo, solo en el camino A.
- Camino B: T2 vuelve a editar `next.config.ts` y `next.config.test.ts` (por eso T2 va siempre tras T1).
  - `modules/users/actions/users.actions.test.ts`: nuevo, junto a `users.actions.ts`.
  - `.github/dependabot.yml`: nuevo; `.github/workflows/ci.yml`: existente, se modifica.
- Contrato de API: no cambia ninguna request/response. Las acciones se prueban con su contrato actual, `ActionResult = { ok: true } | { ok: false; error: string }` y `SessionsResult` (ver `modules/users/types/users.types.ts`).

## Reutilización
- Patrón de test: `modules/account/actions/profile.actions.test.ts` (`vi.hoisted` para mocks de `@/lib/auth`, `@/lib/roles` y el service; `describe.each` por acción; `console.error` espiado; assertions de "el servicio no se llama"). Para `users.actions.ts` se mockean además `next/cache` (`revalidatePath`) y `next/headers` (`headers()` con `origin` para `inviteUserAction`/`resendInvitationAction`) y `../services/users.service` conservando la clase real `UsersError` (por ejemplo `vi.importActual` solo para la clase).
- `lib/auth.test.ts` ya cubre `revoked`/`invited` en `getActor`; el test de acciones solo simula `getActor() => null`.
- Nada nuevo en `components/`, `hooks/` ni `lib/`. Se usan las APIs nativas `headers()` de Next y la opción nativa `contentSecurityPolicy` de Clerk; no se añade ninguna dependencia.

## Archivos sensibles
- `proxy.ts`
- `proxy.test.ts`
- `.github/workflows/ci.yml`

## Cambios de gobierno
Ninguno. Verificado contra `docs/SETUP.md` §3, "Autorizaciones": la lista de gobierno es `.claude/` (salvo `plans/`, `projects/` y `worktrees/`), `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `.mcp.json` y `docs/SETUP.md`. `.github/` no figura ahí. `.github/workflows/` figura en "Rutas sensibles" (cubierto por `apruebo` y la lista de `## Archivos sensibles`, no por `autorizo gobierno`). `.github/dependabot.yml` no está en ninguna de las dos listas (fuera de `.github/workflows/`) y se edita sin autorización específica, pero pasa por el reviewer como cambio de CI/dependencias. Esta spec no toca hooks, `.claude/`, `docs/SETUP.md`, `CLAUDE.md` ni `AGENTS.md`, así que no se necesita `autorizo gobierno`.

## Tests
- `next.config.test.ts` (obligatorio: lógica con valores de seguridad): con `vi.stubEnv("NODE_ENV","production")`, `headers()` devuelve para `/(.*)` las cinco cabeceras con valores exactos de D1; con `NODE_ENV` distinto de producción, no incluye `Strict-Transport-Security`; no incluye `Content-Security-Policy` efectiva; si se usa el camino B, incluye `Content-Security-Policy-Report-Only` con las directivas de Clerk, `object-src 'none'` y `frame-ancestors 'none'`.
- `proxy.test.ts` (solo camino A): con `@clerk/nextjs/server` mockeado, `clerkMiddleware` recibe `contentSecurityPolicy` en modo Report-Only y sin `strict`; `/dashboard` llama a `auth.protect()` y una ruta pública no.
- `users.actions.test.ts`: casos de AC-06 a AC-10 por acción (`describe.each` sobre las 7 acciones, con inputs válidos distintos por acción, incluido `deleteUserAction` con `email`, `updateUserAction` en modo completo y modo solo rol); para `inviteUserAction`/`resendInvitationAction`, un caso extra: sin cabecera `origin` válida se devuelve el genérico y no se llama al servicio. Verificación: `npx vitest run modules/users/actions/users.actions.test.ts`.
- CI y Dependabot no llevan unit tests; se verifican por AC-12 y AC-13 y con el reviewer.

## Riesgos
- CSP rompe Clerk o la UI: mitigado porque la CSP es solo Report-Only (no bloquea) y las cabeceras estáticas no incluyen `Content-Security-Policy`; `X-Frame-Options: DENY` solo impide que la app se enmarque. Revisar `Permissions-Policy` si Clerk pide cámara/micrófono (no se espera).
- Pérdida de render estático: evitada al no usar nonce; AC-02 lo mide. Si el propietario elige nonce en la spec de activación, asume dinámico global (sin ISR, PPR ni caché de CDN) y `dynamic` en `ClerkProvider`.
- Falso positivo en Report-Only: la lista de violaciones incluirá ruido de extensiones del navegador y de HMR/`unsafe-eval` en dev. Medir sobre `npm run build && npm run start` o un preview, con perfil limpio, y no sobre `npm run dev`.
- CSP Report-Only NO cierra la protección CSP efectiva: no bloquea nada, solo mide. La app queda sin defensa CSP hasta una spec de activación (ver Seguimiento). El camino B mide con `'unsafe-inline'`, que subestima violaciones de inline; la activación debe re-medir sin él.
- HSTS: una vez servido por HTTPS el navegador lo recuerda un año; solo se envía con `NODE_ENV=production` (D9), que no garantiza HTTPS (un `npm run start` local es HTTP). Se valida por `curl -I` en un despliegue HTTPS real antes de RELEASE-1 (ver Seguimiento). Sin `includeSubDomains`/`preload` para no atar subdominios.
- El job `audit` puede fallar por una advisory nueva ajena al PR: mitigado con el umbral high/critical, solo prod, y `continue-on-error` visible (no oculto) si el diagnóstico inicial no es limpio; mientras sea informativo (solo con los cuatro datos de D6), un high nuevo no bloquea PRs. Dependabot puede generar ruido: agrupado y limitado a 5 PRs.
- Camino A/B: si Clerk no admite Report-Only, el camino B mide una política equivalente pero no la que generaría Clerk en modo preset; la activación debe re-verificar.

## Plan de tareas
T1 → T2 son secuenciales siempre (T2 puede tocar `next.config.ts` en camino B; por simplicidad se declara igual en camino A). T3 y T4 son paralelas entre sí y con T1 (archivos disjuntos, sin dependencias). 4 tareas, hasta 9 archivos, una sola fase.

### Fase 1
- [x] T1 — Cabeceras estáticas de seguridad (D1, HSTS solo en producción) y test · archivos: `next.config.ts`, `next.config.test.ts` · depende de: — · paralelo (con T3 y T4)
- [x] T2 — CSP Report-Only compatible con Clerk (D2): comprobar tipos reales de `@clerk/nextjs`; camino A en `proxy.ts` con su test, o camino B en `next.config.ts` con su test · archivos: `proxy.ts`, `proxy.test.ts` (camino A) o `next.config.ts`, `next.config.test.ts` (camino B) · depende de: T1 · secuencial; entrega además la lista de violaciones del diagnóstico parcial de AC-05
- [x] T3 — Tests negativos de las acciones de usuarios · archivos: `modules/users/actions/users.actions.test.ts` · depende de: — · paralelo (con T1 y T4)
- [x] T4 — Diagnóstico de dependencias, Dependabot y job `audit` · archivos: `.github/dependabot.yml`, `.github/workflows/ci.yml` · depende de: — · paralelo (con T1 y T3); ejecuta `npm audit --omit=dev` primero y registra el resultado (AC-11); si hay high/critical sin hallazgo, responsable, plazo y criterio de retirada, reporta BLOQUEADO/pendiente (D6)

## Seguimiento
- CSP Report-Only no cierra la protección CSP efectiva. Requisito previo a RELEASE-1: una nueva spec que active una CSP efectiva (D8) o el riesgo aceptado explícitamente y por escrito por el propietario en esa spec/release.
- Requisito OBLIGATORIO previo a RELEASE-1: verificar HSTS (y las cinco cabeceras) con `curl -I` en un despliegue HTTPS real (preview/producción); `npm run start` local con `NODE_ENV=production` no lo sustituye. Si AC-01 quedó `NO EJECUTADO`, se ejecuta aquí.
- La lista de violaciones de AC-05 es un diagnóstico parcial medido con `'unsafe-inline'` en el preset de Clerk; puede ocultar violaciones y no valida una CSP estricta ni el recorrido D4 completo.
- Requisito OBLIGATORIO de la spec posterior de activación de CSP efectiva: ejecutar el recorrido D4 COMPLETO (sign-in con reto Cloudflare, sign-up, `/dashboard`, `/dashboard/users` con invitar, editar y revocar, perfil, cambio de tema), también en preview/despliegue, con registro de violaciones, y repetir la medición sin `'unsafe-inline'` (D4).
- SEC-1-ADJ-01 (sonda `Function("")` de zod, única violación observada) queda registrada y pospuesta a la spec de CSP efectiva. AC-01 con HTTPS real sigue pendiente obligatorio antes de RELEASE-1 (ver arriba).
- Enmienda 2026-11-10: el propietario cierra la ronda UAT con PASS CON OBSERVACIÓN y regulariza AC-05 al diagnóstico parcial realmente ejecutado. Cambió solo la redacción de AC-05, la nota de D4, T2 (referencia a AC-05) y este Seguimiento; AC y tareas sin cambios (14 AC, 4 tareas). Requiere nueva aprobación y firma; la fase sigue siendo Fase 1.
- Pasar `audit` a bloqueante cuando la línea base esté limpia, si empezó informativo; toda excepción `continue-on-error` vence en el plazo registrado (D6).
