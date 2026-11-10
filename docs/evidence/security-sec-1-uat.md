# Registro UAT: security-sec-1

Documentación informativa (D7). Formato: `docs/forms/uat.md` (secciones 5 y 6). Registro del gate sobre el PR (alcance: PR). Aceptación funcional declarada por el propietario el 2026-11-10 (ver sección Aceptación); este registro no habilita por sí solo el merge ni RELEASE-1.

Aceptación: ver sección «Aceptación» (PASS FUNCIONAL DEFINITIVO CON OBSERVACIÓN, alcance PR #23, commit fce4018).

## Gate de inicio de ronda

- gate: obligatorio
- Justificación: iniciativa de seguridad (cabeceras y CSP Report-Only) con impacto en todas las rutas.
- alcance: PR (fecha 2026-11-10)
- PR: #23 https://github.com/ronalehm/next-js-template-v2/pull/23 · Rama: feat/sec-1-audit · Commit exacto: fce401874d1288c9eb01cb11c8978d86be01cf6f (base c19bb35)

| # | Condición | Estado |
|---|---|---|
| 1 | PR identificable, con rama y commit exacto | CUMPLE: PR #23 OPEN, MERGEABLE, headRefOid=fce4018, rama feat/sec-1-audit, 11 archivos |
| 2 | Verificaciones técnicas previas a UAT aprobadas por el reviewer | CUMPLE: reviewer técnico APROBADO + CI checks y audit SUCCESS sobre el mismo run |
| 3 | Copia local o entorno de pruebas del commit del PR | CUMPLE: T-A: `git rev-parse HEAD` = commit del PR, árbol limpio, `npm run build` + `npm run start -p 3101` sobre ese commit |
| 4 | Cuentas y bases de datos de prueba aisladas de producción | CUMPLE: Clerk DEV y Neon DEV confirmados por el propietario |
| 5 | Alcance funcional y casos UAT disponibles para el Orchestrator | CUMPLE: AC-01..AC-14 y este registro |
| 6 | Instrucciones sencillas para el usuario funcional | CUMPLE: instrucciones una por una T-A, T-B, T-C |

## Registro UAT compacto

Entorno verificado: commit fce4018 con `npm run build` + `npm run start -p 3101` (HTTP local), Clerk DEV y Neon DEV. alcance: PR. CI: checks y audit SUCCESS; PR sin conflictos; la descripción del PR #23 contiene la evidencia definitiva.

Verificación de código: SEC-1 cabeceras y CSP Report-Only · proxy.ts, next.config.ts, .github/, modules/users · commit fce401874d1288c9eb01cb11c8978d86be01cf6f (2026-11-10)

Commit posterior solo documental (docs/evidence): ajena → PASS vigente; cualquier cambio en proxy.ts, next.config.ts, .github/, modules/users o package*.json → afectada → revalidar.

### Pruebas

#### Automatizadas

| Prueba | Tipo | Estado de resultado | Commit exacto (o fecha / id si preliminar) | Qué validó el usuario | Conclusión de impacto ante commit nuevo |
|---|---|---|---|---|---|
| CI: checks (lint, tests, build) | automatizada | PASS | fce4018 | — | ajena → PASS vigente (CI sobre el commit exacto) |
| CI: job audit | automatizada | PASS | fce4018 | — | ajena → PASS vigente (CI sobre el commit exacto) |
| Reviewer técnico | automatizada | APROBADO | fce4018 | — | ajena → PASS vigente si el commit posterior es solo documental |
| Reviewer integral (lint, vitest 698 PASS / 7 skipped, build), `npm audit --omit=dev` (0 vulnerabilidades) | automatizada | PASS | preliminar 2026-11-10 (previo al commit) | — | preliminar, superado por CI sobre el commit fce4018 |

AC-06..AC-10 y AC-12..AC-14: ajena → PASS vigente (CI sobre el commit exacto fce4018).

#### Manuales (validó el propietario)

| Prueba | Tipo | Estado de resultado | Commit exacto (o fecha / id si preliminar) | Qué validó el usuario | Conclusión de impacto ante commit nuevo |
|---|---|---|---|---|---|
| T-A | manual | PASS | fce4018 | Commit y árbol limpio, build, tabla de rutas y cabeceras correctos (CSP Report-Only presente, sin CSP efectiva); Clerk DEV y Neon DEV. Solo HTTP local | afectada si cambia proxy.ts, next.config.ts, .github/, modules/users o package*.json → revalidar; documental → ajena |
| T-B | manual | PASS | fce4018 | Sin sesión, /dashboard/users redirige a login y no expone usuarios | afectada si cambia proxy.ts, next.config.ts, .github/, modules/users o package*.json → revalidar; documental → ajena |
| T-C | manual | PASS CON OBSERVACIÓN | fce4018 | Clerk, dashboard, usuarios, perfil, configuración, estilos y tema oscuro sin parpadeo. En Chrome Invitado solo permanecen la advertencia CSP `unsafe-eval` conocida (SEC-1-ADJ-01) y la advertencia de Clerk DEV (instancia de desarrollo) | afectada si cambia proxy.ts, next.config.ts, .github/, modules/users o package*.json → revalidar; documental → ajena |
| T-01 | manual | PASS | preliminar 2026-11-10 | Build correcto; cabeceras HTTP presentes en localhost:3101, incl. Content-Security-Policy-Report-Only | preliminar, superado por T-A/T-B/T-C |
| T-02 | manual | PASS | preliminar 2026-11-10 | Sin sesión, /dashboard/users redirige a sign-in y no muestra datos | preliminar, superado por T-A/T-B/T-C |
| T-03 | manual | PASS | preliminar 2026-11-10 | Login real con Clerk DEV y acceso al dashboard | preliminar, superado por T-A/T-B/T-C |
| T-04 | manual | PASS | preliminar 2026-11-10 | Dashboard, usuarios, perfil, configuración y componentes visuales funcionan | preliminar, superado por T-A/T-B/T-C |
| T-05 | manual | PASS CON OBSERVACIÓN | preliminar 2026-11-10 | Violación script-src Report-Only por `unsafe-eval` en /_next/static/chunks/35xfw9g34zo9t.js, sin fallo funcional; causa en SEC-1-ADJ-01 | preliminar, superado por T-A/T-B/T-C (ADJ-01 observada de nuevo en T-C) |

Revalidación sobre el commit por T-A/T-B/T-C: AC-01 solo lado local (HTTPS real NO EJECUTADO); AC-02 observado + razonamiento; AC-03 y AC-04 revalidados; AC-05 parcial (recorrido D4 incompleto).

### Evaluación de AC-02

Evidencia: tabla observada sobre el commit fce4018 (solo /_not-found ○ estática; el resto ƒ dinámica) + razonamiento del reviewer (esas rutas ya eran dinámicas por Clerk; las cabeceras y la CSP Report-Only sin strict no vuelven dinámica ninguna ruta estática) + CI build PASS. Marcable solo como «observado + razonamiento»; el propietario acepta esa evidencia y razonamiento (2026-11-10), sin atribuirle una comparación histórica automatizada. Reserva explícita: NO existe comparación automatizada con el build anterior, que es lo que literalmente pide AC-02.

### Evaluación de AC-05 contra el recorrido D4

D4 exige recorrer sign-in, sign-up, `/dashboard`, `/dashboard/users` (invitar, editar, revocar), perfil y cambio de tema, con DevTools abiertas, incluido el reto Cloudflare en el login.

| Paso del recorrido D4 | Estado |
|---|---|
| sign-in / login | Cubierto por el propietario (T-C) |
| `/dashboard` | Cubierto (T-C) |
| `/dashboard/users` (vista) | Cubierto (T-C) |
| perfil | Cubierto (T-C) |
| configuración, estilos | Cubierto (T-C; no listados en D4) |
| cambio de tema (tema oscuro) | Cubierto (T-C, sin parpadeo) |
| sign-up | NO EJECUTADO / no reportado |
| `/dashboard/users`: invitar | NO EJECUTADO / no reportado |
| `/dashboard/users`: editar | NO EJECUTADO / no reportado |
| `/dashboard/users`: revocar | NO EJECUTADO / no reportado |
| reto Cloudflare en el login | NO EJECUTADO / no reportado |

Resultado: recorrido D4 parcial (cobertura PARCIAL; pasos no ejecutados diferidos a la spec de activación de CSP efectiva, que debe repetir el recorrido D4 completo sin `'unsafe-inline'`). Respuesta previa del reviewer de cierre (2026-11-10, antes de la enmienda): «AC-05 NO puede marcarse [x]: el literal exige el recorrido D4 completo (sign-in, sign-up, /dashboard, /dashboard/users con invitar, editar y revocar, perfil, cambio de tema, reto Cloudflare) y se entregó una lista de un recorrido parcial; diferir los pasos restantes a la spec de activación de CSP efectiva equivale a rebajar el AC y exige reaprobación de la spec.» Decisión del propietario: vía (b), enmienda de la spec; aprobada y firmada; casilla marcable por el propietario. La lista de violaciones observada contiene solo ADJ-01, medida con `'unsafe-inline'` del preset de Clerk, por lo que NO valida una CSP estricta; la spec de activación debe repetir el recorrido completo sin `'unsafe-inline'`.

### Observaciones (12 campos)

| ID | Prueba relacionada | Descripción | Clasificación | Prioridad | Decisión | Autorización | Implementación (PR y/o ticket) | Regresión | Aceptación | Responsable / asignado | Estado de ciclo de vida |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SEC-1-ADJ-01 | T-05, T-C | Violación script-src (Report-Only) por `Function("")` en /_next/static/chunks/35xfw9g34zo9t.js, origen localhost:3101, sin fallos funcionales; observada de nuevo en T-C sobre el commit fce4018. Causa (reviewer): sonda `allowsEval` de zod 4.6.7 (`try{return Function(""),!0}catch{return!1}`, omitida con jitless); sonda inocua de tercero; bajo CSP efectiva caería al catch y zod usaría el camino sin JIT. Opciones para la spec de activación (no implementadas): aceptar el reporte, o `z.config({ jitless: true })`; NO `unsafe-eval` ni debilitar la CSP. Bloquea cierre de SEC-1: no. | dependencia de terceros / seguimiento | baja | posponer a la spec de activación de CSP efectiva | — | — | — | — | posponer a la activación de CSP efectiva (no bloqueante) | 2 (resultado manual confirmado) / 4 (mejora solicitada, pospuesta) |

La advertencia de Clerk DEV (instancia de desarrollo) vista en T-C es propia del entorno DEV y no se registra como observación.

### Estados de ciclo de vida

Ver `docs/forms/uat.md` sección 6 (1 a 7).

### Aceptación

Declaración textual del propietario (2026-11-10): «Como propietario, declaro PASS FUNCIONAL DEFINITIVO CON OBSERVACIÓN para la UAT del commit fce401874d1288c9eb01cb11c8978d86be01cf6f.»

Alcance: PR #23, commit fce4018. Resultado: PASS FUNCIONAL DEFINITIVO CON OBSERVACIÓN.

- Resultados aceptados: T-A PASS, T-B PASS, T-C PASS CON OBSERVACIÓN.
- Estado de ciclo de vida de lo aceptado: 7 (revalidación funcional aceptada) para T-A, T-B y T-C.
- T-01..T-05 se conservan como pruebas preliminares superadas por T-A/T-B/T-C.
- SEC-1-ADJ-01: posponer a la activación de CSP efectiva (no bloqueante).
- AC-02: el propietario acepta la evidencia observada y el razonamiento del reviewer; no se le atribuye una comparación histórica automatizada con el build anterior.
- AC-05: cobertura PARCIAL; no se afirma la ejecución completa del recorrido D4. Los pasos no ejecutados (sign-up, invitar, editar, revocar, reto Cloudflare) se difieren a la spec de activación de CSP efectiva, que debe repetir el recorrido D4 completo sin `'unsafe-inline'`. Respuesta previa del reviewer de cierre (2026-11-10, antes de la enmienda): «AC-05 NO puede marcarse [x]: el literal exige el recorrido D4 completo (sign-in, sign-up, /dashboard, /dashboard/users con invitar, editar y revocar, perfil, cambio de tema, reto Cloudflare) y se entregó una lista de un recorrido parcial; diferir los pasos restantes a la spec de activación de CSP efectiva equivale a rebajar el AC y exige reaprobación de la spec.» Decisión del propietario: vía (b), enmienda de la spec; aprobada y firmada; casilla marcable por el propietario.
- Casillas marcables según el reviewer: AC-02 (condicionado, aceptado por el propietario), AC-03, AC-04, AC-06..AC-10, AC-12..AC-14 (AC-11 solo si el reviewer técnico lo validó). Sin marcar: AC-01. AC-05 marcable por el propietario con la nueva redacción (ver línea 106).
- Pendientes obligatorios antes de RELEASE-1: AC-01 HTTPS real (`curl -I` en despliegue HTTPS real, 5 cabeceras incluida HSTS) y activación de CSP efectiva (spec nueva, o riesgo aceptado por escrito).
- CI no se ha ejecutado sobre el commit que contenga este registro (cambio solo documental: ajena → PASS vigente).

### Decisión del propietario y alcance real (2026-11-10)

- Decisión: finalizar la ronda UAT con PASS CON OBSERVACIÓN, sin más pruebas manuales, y regularizar formalmente AC-05 mediante enmienda de la spec (AC-05 pasa a corresponder al diagnóstico CSP Report-Only parcial realmente ejecutado). La enmienda requería nueva aprobación y firma SSH del propietario: aprobada y firmada; casilla marcable por el propietario.
- Alcance real de las pruebas (sin ampliar): recorrido parcial en navegador sobre fce4018 (build + start local en DEV, Clerk DEV y Neon DEV): login Clerk, dashboard, usuarios en vista, perfil, configuración, estilos y tema oscuro sin parpadeo; cabeceras por `curl -I` (HTTP local); /dashboard/users sin sesión redirige a login. NO ejecutado: sign-up, invitar/editar/revocar, reto Cloudflare, preview/despliegue HTTPS, medición sin `'unsafe-inline'`.
- Evidencia de AC-05: lista de violaciones = solo SEC-1-ADJ-01 (sonda `Function("")` de zod 4.6.7), medida con `'unsafe-inline'` del preset de Clerk; NO valida una CSP estricta ni el recorrido D4 completo.
- D4 completo (sign-in con Cloudflare, sign-up, dashboard, usuarios con invitar/editar/revocar, perfil, cambio de tema, también en preview, con registro de violaciones y re-medición sin `'unsafe-inline'`) es requisito OBLIGATORIO de la spec posterior de activación de CSP efectiva.
- AC-01 HTTPS real sigue pendiente obligatorio antes de RELEASE-1; SEC-1-ADJ-01 registrada y pospuesta a la spec de CSP efectiva.
- Casillas marcables tras la nueva aprobación (según el reviewer previo): AC-02 (condicionado, aceptado por el propietario), AC-03, AC-04, AC-06..AC-10, AC-12..AC-14 (AC-11 solo si el reviewer técnico lo validó); AC-05 solo tras la aprobación y firma de la nueva redacción; AC-01 no.
- El hash de aprobación anterior deja de ser válido con la enmienda. El commit que incluya la spec enmendada y este registro es documental (ajena → PASS vigente respecto a fce4018, sin cambios en proxy.ts, next.config.ts, .github/, modules/users ni package*.json).

### Riesgos pendientes

- AC-01 HTTPS real: NO EJECUTADO (T-A solo validó HTTP local); `curl -I` sobre HTTPS real obligatorio antes de RELEASE-1.
- CSP efectiva: obligatoria antes de RELEASE-1 (nueva spec de activación) salvo aceptación expresa del riesgo por escrito.
- SEC-1-ADJ-01: no bloqueante, pospuesta a la spec de activación de CSP efectiva.
- AC-05 con recorrido D4 parcial (ver evaluación); la medición usó `'unsafe-inline'`.
- AC-02 sin comparación automatizada con el build anterior (solo observado + razonamiento).
- Aprobación y firma tras la enmienda del 2026-11-10 verificadas por el reviewer (solo lectura): Estado: aprobado, Fase 1; hash 49a31270…03c56d = última línea de approvals.jsonl (ronalehm, 2026-11-10T07:51Z); la línea anterior cf07798b…aeffd (06:24Z) permanece en el ledger; ssh-keygen -Y verify → Good "spec-approval" signature for approver (ED25519). AC-05 queda marcable con la nueva redacción (diagnóstico parcial); AC-01 sigue sin marcar.
- CI no ejecutado tras el commit de este registro.
