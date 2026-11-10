# Registro UAT: security-sec-1

Documentación informativa (D7). Formato: `docs/forms/uat.md` (secciones 5 y 6). Resultado preliminar: no da PASS definitivo ni habilita merge.

UAT definitiva: pendiente; el gate sobre el PR aún no se ejecutó.

## Gate de inicio de ronda

- gate: obligatorio
- Justificación: iniciativa de seguridad (cabeceras y CSP Report-Only) con impacto en todas las rutas.
- alcance: preliminar (sin PR ni commit; cambios sin commit sobre base c19bb35; fecha 2026-11-10)
- PR: — · Rama: feat/sec-1-audit · Commit exacto: — (base c19bb35 + cambios sin commit)

| # | Condición | Estado |
|---|---|---|
| 1 | PR identificable, con rama y commit exacto | No aplica en preliminar (sin PR ni commit) |
| 2 | Verificaciones técnicas previas a UAT aprobadas por el reviewer | Cumplida: reviewer APROBADO (lint, vitest 698 PASS / 7 skipped, build PASS en la revisión integral) |
| 3 | Copia local o entorno de pruebas del commit del PR | Entorno local: `npm run build` + `npm run start` en localhost:3101 (cambios sin commit) |
| 4 | Cuentas y bases de datos de prueba aisladas de producción | Confirmado por el propietario: Clerk DEV y Neon DEV |
| 5 | Alcance funcional y casos UAT disponibles para el Orchestrator | Casos T-01 a T-05 (ver Pruebas) |
| 6 | Instrucciones sencillas para el usuario funcional | Pruebas validadas por el propietario (ver Pruebas) |

## Registro UAT compacto

Entorno verificado: `npm run build` + `npm run start` en localhost:3101, Clerk DEV real. alcance: preliminar.

Verificación de código: SEC-1 cabeceras y CSP Report-Only · proxy.ts, next.config.ts · base c19bb35 + cambios sin commit (preliminar, 2026-11-10)

### Pruebas

#### Automatizadas

| Prueba | Tipo | Estado de resultado | Commit exacto (o fecha / id si preliminar) | Qué validó el usuario | Conclusión de impacto ante commit nuevo |
|---|---|---|---|---|---|
| Reviewer integral: lint, vitest, build | automatizada | PASS | preliminar 2026-11-10 | — | pendiente de evaluar si cambia el código |
| `npm audit --omit=dev` (0 vulnerabilidades) | automatizada | PASS | preliminar 2026-11-10 | — | pendiente de evaluar si cambia el código |
| Reviewer focalizado | automatizada | APROBADO | preliminar 2026-11-10 | — | pendiente de evaluar si cambia el código |

#### Manuales (validó el propietario)

| Prueba | Tipo | Estado de resultado | Commit exacto (o fecha / id si preliminar) | Qué validó el usuario | Conclusión de impacto ante commit nuevo |
|---|---|---|---|---|---|
| T-01 | manual | PASS | preliminar 2026-11-10 | Build correcto; cabeceras HTTP presentes en localhost:3101, incl. Content-Security-Policy-Report-Only | pendiente de evaluar si cambia el código |
| T-02 | manual | PASS | preliminar 2026-11-10 | Sin sesión, /dashboard/users redirige a sign-in y no muestra datos | pendiente de evaluar si cambia el código |
| T-03 | manual | PASS | preliminar 2026-11-10 | Login real con Clerk DEV y acceso al dashboard | pendiente de evaluar si cambia el código |
| T-04 | manual | PASS | preliminar 2026-11-10 | Dashboard, usuarios, perfil, configuración y componentes visuales funcionan | pendiente de evaluar si cambia el código |
| T-05 | manual | PASS CON OBSERVACIÓN | preliminar 2026-11-10 | Violaciones script-src Report-Only observadas; el propietario la reporta como violación script-src por `unsafe-eval` no permitido en /_next/static/chunks/35xfw9g34zo9t.js, sin fallo funcional; la causa ya está en SEC-1-ADJ-01 (sonda `Function("")` de zod, que exigiría unsafe-eval) | pendiente de evaluar si cambia el código |

Alcance de AC-05: la lista de violaciones contiene solo ADJ-01. Se midió con `'unsafe-inline'` en el preset de Clerk, por lo que NO equivale a validar una CSP estricta; la spec de activación debe re-medir sin `unsafe-inline`.

### Observaciones (12 campos)

| ID | Prueba relacionada | Descripción | Clasificación | Prioridad | Decisión | Autorización | Implementación (PR y/o ticket) | Regresión | Aceptación | Responsable / asignado | Estado de ciclo de vida |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SEC-1-ADJ-01 | T-05 | Violación script-src (Report-Only) por `Function("")` en /_next/static/chunks/35xfw9g34zo9t.js, origen localhost:3101, sin fallos funcionales. Causa (reviewer): sonda `allowsEval` de zod 4.6.7 (`try{return Function(""),!0}catch{return!1}`, omitida con jitless); sonda inocua de tercero; bajo CSP efectiva caería al catch y zod usaría el camino sin JIT. Opciones para la spec de activación (no implementadas): aceptar el reporte, o `z.config({ jitless: true })`; NO `unsafe-eval` ni debilitar la CSP. Bloquea cierre de SEC-1: no. | dependencia de terceros / seguimiento | baja | posponer a la spec de activación de CSP efectiva | — | — | — | — | — | — | 2 (resultado manual confirmado) / 4 (mejora solicitada, pospuesta) |

### Estados de ciclo de vida

Ver `docs/forms/uat.md` sección 6 (1 a 7).

### Pendientes

- AC-02 (evidencia observada + razonamiento): tabla de rutas del build aportada por el propietario (preliminar 2026-11-10): ƒ / · ○ /_not-found · ƒ /dashboard · ƒ /dashboard/profile · ƒ /dashboard/settings · ƒ /dashboard/sign-out · ƒ /dashboard/users · ƒ /sign-in/[[...sign-in]] · ƒ /sign-up/[[...sign-up]]. Esta tabla confirma el estado observado; NO es una comparación automatizada con el build anterior. El reviewer añadió el razonamiento de que esas rutas ya eran dinámicas por Clerk y que las cabeceras de next.config y la CSP Report-Only de clerkMiddleware no vuelven dinámica ninguna ruta estática.
- AC-04: «tema claro/oscuro sin parpadeo» sin confirmación explícita (el propietario no la aportó).
- AC-01: `curl -I` sobre HTTPS real NO EJECUTADO; obligatorio antes de RELEASE-1.
- Activación de CSP efectiva (nueva spec o riesgo aceptado por escrito): obligatoria antes de RELEASE-1.
