# Fiabilidad del gobierno SDD (hook de aprobación, fase, UAT y cierre)

- Módulo: governance
- Estado: aprobado
- ID: SPEC-governance-sdd-reliability
- Riesgo: alto (modifica el hook que decide qué puede editar un agente; un error debilita el control o bloquea todo el flujo)
- Ruta: SDD-ADVANCED (disparador: hooks, agentes, `.claude/settings.json` y `docs/SETUP.md`)
- Fase actual: B

## Objetivo

Corregir el error de exactitud del hook `.claude/hooks/spec-approval.mjs` con fases de varias palabras (`Fase 1`) y cerrar fricciones documentadas del flujo, sin debilitar ningún control. Para el mantenedor del flujo SDD y para quien firma: lo que se firma y lo que se registra debe decir la fase real.

Una spec, dos fases. Cada fase tiene su aprobación y firma propias porque `Fase actual` entra en el hash. La transición a Fase B exige cambiar la línea `Fase actual`, volver a `Estado: borrador`, aprobar y firmar de nuevo (decisión del propietario).

Modelo de rutas vigente (no cambia): READ-ONLY; BUILD (ODD-LIGHT); SDD-LITE; SDD-ADVANCED. UAT-LEAN y UAT-LIGHT son modalidades de validación independientes de la clasificación de desarrollo. Esta spec es SDD-ADVANCED.

Dos autorizaciones distintas, sin mezcla: la aprobación funcional (`apruebo docs/specs/<slug>.md` más firma `.sig`) autoriza la fase actual y las rutas de `## Archivos sensibles`; la autorización privilegiada (`autorizo gobierno docs/specs/<slug>.md` más firma `.gov.sig`) autoriza las rutas de `## Cambios de gobierno`, solo en la misma sesión y durante 2 h. Ninguna sustituye a la otra y cada fase exige las dos.

## Alcance y reglas

- Incluye (Fase A): `phase()` con el valor completo, id de fase, declaración `Fase:` del gate, compatibilidad con firmas legadas, pruebas, prueba de caracterización del gate con `Modo: build`, prueba de que una sección con título distinto no se lee como `## Cambios de gobierno`.
- Incluye (Fase B): `planOpen` limitado a la subsección de la `Fase actual` con sus pruebas negativas, y reglas documentales (quién marca los AC, Read/Grep/Glob en lugar de `grep` sobre el hook, citar la spec por slug en `Modo: build` y que BUILD no evita una aprobación SDD, recuperación por hook desalineado).
- No incluye: cambiar `.claude/settings.json` (no se modifica en ninguna fase); estrechar `relay`/`deny` sobre `record`; lista de permitidos de lectura para Bash del developer (fuera de alcance; requeriría spec propia con pruebas de evasión); cambiar el gate para `Modo: build`; cambiar `.claude/agents/spec.md` o `.claude/agents/reviewer.md` (el reviewer ya registra evidencia por comprobación); app, Clerk, Neon, migraciones; editar `approvals.jsonl`; multi-aprobador o verificación en servidor.
- RN-01: `phase(text)` devuelve el valor completo de la línea `Fase actual:` (sin viñeta, con trim). El id de fase es ese valor sin el prefijo opcional `/^Fase\s+/i`. Con valor vacío el comportamiento no cambia.
- RN-02: el gate acepta `Fase: <id>` o `Fase: Fase <id>` por coincidencia exacta con límite: `1` no coincide con `10` ni con `1.1`; puntuación final de frase, backticks, `**` y comillas siguen tolerados; varias specs en un prompt siguen funcionando. `Fase: Fase` ya no basta para `Fase 1`.
- RN-03: `humanSigned` acepta el statement nuevo o el legado (fase = primer token del valor). El hash completo sigue en el statement, así que una firma legada solo vale para el contenido exacto que se firmó. El ledger HMAC y `gov.sig` usan la fase almacenada en la entrada y no cambian.
- RN-04: sin firma SSH externa válida nada se desbloquea.
- RN-05: `apruebo` nunca autoriza gobierno; `autorizo gobierno` exige aprobación válida y firma `.gov.sig`, sesión y 2 h.
- RN-06: `approvals.jsonl` y `spec-privileged.jsonl` no son editables por agentes.
- RN-07: el hash invalida cambios de contenido o de `Fase actual`; la aprobación es por checkout/raíz; `Modo: build` no abre rutas sensibles ni de gobierno. El gate no se modifica para `Modo: build` (se fija su comportamiento actual con una prueba de caracterización).
- RN-08 (Fase B): `planOpen` mira solo la subsección `### Fase <id>` de la `Fase actual` (id con coincidencia exacta: `### Fase 1` no es `### Fase 10`). Fallback seguro: si la sección `## Plan*` no tiene ninguna subsección `### Fase`, se usa toda la sección (comportamiento actual); si tiene subsecciones pero ninguna es la `Fase actual`, `planOpen` es falso (nada autorizado, el caso más restrictivo). Una fase cerrada no reutiliza permisos.
- RN-09 (Fase B): el orquestador marca los AC (`- [ ]`→`- [x]`) solo con evidencia del reviewer (APROBADO que cite el AC); developer y reviewer no editan specs.
- RN-10 (Fase B): se documentan las limitaciones aceptadas: usar Read/Grep/Glob y no Bash sobre `docs/specs` ni `grep record` sobre el hook; recuperación por hook desalineado.
- RN-11 (Fase B): `Modo: build` no puede usarse para evitar una aprobación SDD. Si el trabajo toca disparadores SDD, rutas protegidas o archivos de gobierno, se reclasifica a SDD. Citar una spec por slug en un brief `Modo: build` (Opción 0, sin ruta `docs/specs/...`, para evidencia UAT) no la hace autorizadora ni abre nada.
- RN-12: la sección `## Cambios de gobierno` lista solo las rutas de la fase actual, porque el hook la lee completa sin distinguir fase y la autorización cubre todas sus rutas durante 2 h en la sesión. Las rutas de las demás fases se declaran en `## Gobierno afectado por fase` (título que el hook no parsea) y se mueven a `## Cambios de gobierno` al cambiar `Fase actual`. Cada fase exige `autorizo gobierno` y firma `.gov.sig`.
- RN-13 (Fase B): una sola frase en SETUP («Pruebas y observaciones») liga criticidad a urgencia/bloqueo: crítica (seguridad/integridad/aislamiento/bloqueo crítico) = análisis inmediato y bloquea la aceptación afectada; funcional = según impacto; mejora opcional = backlog, no bloquea. La criticidad NO determina la ruta ni autoriza `Modo: build`: la ruta sale de la verificación completa (SETUP 8.6) y BUILD no evita SDD (RN-11). No se redefine nada más de UAT. `docs/forms/uat.md` (columna «Prioridad») no está en T3 y no se edita; la escala queda en SETUP.
- RN-14: este PR (gobierno/herramientas: hooks, pruebas del hook, instrucciones de agentes y SETUP; sin comportamiento funcional visible de la app, permisos, autenticación ni datos de producto) puede declarar «UAT no aplicable» según SETUP («Obligatoriedad»), con justificación registrada y verificaciones técnicas completas (condiciones 1 y 2 del gate: PR con commit exacto y APROBADO del reviewer; `npx vitest run .claude/hooks` con las 47 pruebas actuales más las nuevas; lint/build según la tabla del reviewer; ninguna prueba ni control se omite). Ante duda el gate es obligatorio; si el reviewer detecta cambio funcional observable, no se declara. La decisión final es del propietario en el PR.

## Decisiones del propietario (incorporadas)

1. `planOpen` por subsección de la fase actual: se implementa, en Fase B, con pruebas negativas (RN-08).
2. Sin lista de lectura Bash para developer: solo documentar Read/Grep/Glob. Fuera de alcance.
3. `Modo: build` con spec citada: Opción 0, referencia por slug, gate sin cambios; BUILD no evita aprobaciones SDD (RN-11).
4. `Fase actual: A` se mantiene; la transición a B exige cambiar la línea, borrador, aprobar y firmar de nuevo.

## Actores y matriz de acceso

| Actor o rol | Recurso o acción | Permitido | Condición |
|---|---|---|---|
| Usuario | Escribir `apruebo` / `autorizo gobierno` y firmar con SSH | Sí | Solo él; ningún agente |
| Developer | Editar `.claude/hooks/*` | Sí | Solo con `autorizo gobierno` firmado, sesión y 2 h, y ruta en `## Cambios de gobierno` |
| Developer | Escribir en `docs/specs/` | No | Sin cambios |
| Orquestador | Marcar casillas de plan y AC | Sí | Solo marcar, nunca desmarcar; con evidencia del reviewer |
| Reviewer | Editar archivos | No | Verifica el diff real y los AC |
| Cualquier agente | Editar `approvals.jsonl`, `spec-privileged.jsonl`, clave | No | `NEVER` sin cambios |

## Diagnóstico verificado y clasificación

Archivo de referencia: `.claude/hooks/spec-approval.mjs`.

| # | Hallazgo | Evidencia | Clasificación | Decisión |
|---|---|---|---|---|
| 1 | `phase()` toma solo `\S+`: `Fase 1` queda como `Fase` | l.86; usos: statement l.140, ledger l.213, mensaje l.226, gate l.304-307 (regex declarada l.305). Specs con `Fase 1`: ci-pr-checks, docs-async-rsc-tests, template-v2-uat-workflow, users-admin-edit, users-admin-edit-role, users-hard-delete, account-profile-custom-fields. Las pruebas usan solo B, C, B.1 (test.mjs l.437, l.706, l.795) | Error comprobado (exactitud/UX; la integridad no se rompe porque `hash()` l.88 cubre la línea) | Fase A |
| 2 | `relay` (l.476) y `deny` de settings bloquean `grep record` sobre el hook | `recordsByHand`; `deny` `Bash(*spec-approval*record*)`; SETUP l.271 ya lo documenta; estrechar rompe el caso de copia del hook (test.mjs l.645) | Limitación aceptada | No cambiar; documentar en Fase B |
| 3 | `developer()` bloquea todo Bash/PowerShell que mencione `docs/specs`, incluso lectura | l.448-455, `SPEC_PATH`; Read/Grep/Glob no se bloquean (solo se mira `file_path`/`command`) | Fricción menor | Decidido: sin lista de lectura Bash (fuera de alcance); documentar Read/Grep/Glob (Fase B) |
| 4a | Ambigüedad de quién marca los AC | `hash()` normaliza todo `- [x]` (l.89), orchestrator.md l.102 y SETUP l.251/l.333 solo citan el plan | Fricción documental | Fase B |
| 4b | `planOpen` mira toda la sección `## Plan*`: tareas abiertas de otra fase mantienen abiertas las rutas de la fase cerrada | l.179 (`sectionLines` solo corta en `## `, no en `### `); usado en l.238, l.340, l.364 | Riesgo (autorización persistente hasta cambiar `Fase actual`); mitigación actual: cambiar `Fase actual`, que ya exige nueva aprobación | Fase B, firme (decidido) |
| 5 | `gate()` valida toda spec citada por ruta, también con `Modo: build` | l.293-309: con rutas citadas no hay salida temprana por `Modo: build` (solo l.295 sin rutas) | No es error: citar una spec la somete a validación | Decidido: Opción 0 (citar por slug), gate sin cambios; prueba de caracterización en Fase A; regla RN-11 en Fase B |
| 6 | La copia del hook del checkout principal corre en sesiones de escritorio con worktree y `checkIntegrity()` bloquea si difiere | l.186-191; SETUP l.273 | Riesgo operativo conocido | Documentar recuperación (Fase B) |

Verificación del parseo (l.91-103 y l.179): `section(text, title)` solo lee la sección cuyo encabezado, tras `trim()`, es exactamente `## <title>`, y solo toma líneas `- \`ruta\``; `planOpen` solo mira la sección cuyo encabezado empieza por `## Plan`. `## Gobierno afectado por fase` no coincide con ninguno de los dos, y sus rutas van en tabla (líneas que empiezan por `|`), que la expresión `^- \`` tampoco lee.

### Decisión sobre dónde ubicar `planOpen` (Fase A o B)

Se mantiene en Fase B (decisión del propietario). Hueco entre fases: al cerrar Fase A con tareas abiertas en Fase B, las rutas de Fase A (hook y su test) siguen autorizadas hasta cambiar `Fase actual`, y además son las mismas que toca Fase B. Mitigación: tras cerrar y revisar Fase A, el agente `spec` cambia `Fase actual` a `B` sin demora (invalida la aprobación por hash), y `autorizo gobierno` caduca a las 2 h y es por sesión. Mover T4 a Fase A ampliaría el cambio del hook más allá del error comprobado y mezclaría dos contratos en una firma; no compensa.

## Diseño y dependencias

Sin dependencias nuevas, sin UI.

- `.claude/hooks/spec-approval.mjs` — existente. Cambios Fase A: `phase()` valor completo; `phaseId()` nuevo helper interno; `declared` del gate; `humanSigned` con statement legado; mensaje de `approve` con el id. Fase B: `planOpen` por subsección de la fase actual.
- `.claude/hooks/spec-approval.test.mjs` — existente. Pruebas nuevas en ambas fases.
- Fase B: `.claude/agents/orchestrator.md`, `.claude/agents/developer.md`, `docs/SETUP.md` (documentación).

## Contratos y datos

```ts
// Valor de la línea "Fase actual:" (trim, sin viñeta). "" si no hay línea.
phase(text): string                // "Fase 1" -> "Fase 1";  "A" -> "A"
phaseId(text): string              // phase sin /^Fase\s+/i: "Fase 1" -> "1"; "A" -> "A"
legacyPhase(text): string          // primer token de phase: "Fase 1" -> "Fase" (solo para verificar firmas antiguas)

// statement(spec, text) = `spec-approval\n${root}\n${spec}\n${hash(text)}\n${phase(text)}\n`   (nuevo, valor completo)
// humanSigned = sshVerified(statement nuevo) || sshVerified(statement con legacyPhase)         (ambos con el mismo hash)

// Gate: el prompt declara la fase actual si existe una ocurrencia de
//   /\bFase:\s*(?:Fase\s+)?[`*"']*<id escapado>(?![\w-]|\.\w)/i   (palabra "Fase:" sin distinguir mayúsculas; id exacto)
//   "1" != "10", "1" != "1.1", "B" != "B.1"; "B." (final de frase) y `Fase: B` entre backticks/**/comillas sí.
//   Con phase vacía no se exige nada (como hoy).

// Fase B: planOpen(text) -> boolean
//   sub = líneas de la subsección "### Fase <phaseId>" (hasta el siguiente "## " o "### "), id exacto
//   si la sección "## Plan*" no tiene ningún "### Fase": mirar toda la sección (como hoy)
//   si tiene "### Fase" pero ninguna coincide con la fase actual: false (más restrictivo)
//   si no: sub.some(/- \[ \]/)
```

Tabla de statement legado frente a nuevo:

| Caso | Statement nuevo | Statement legado | Válido |
|---|---|---|---|
| Fase de un token (`B`) | igual | igual | Sí (indistinguibles) |
| `Fase 1`, firmada antes de este cambio | `...\nFase 1\n` | `...\nFase\n` | Sí, solo con el hash actual de la spec |
| `Fase 1`, firmada después | `...\nFase 1\n` | no se usa | Sí |
| Contenido cambiado tras firmar | otro hash | otro hash | No |
| Firma de otra spec, otra raíz, otra fase (ni completa ni primer token) | distinto | distinto | No |

El ledger y `spec-privileged.jsonl` no cambian de formato: `functionalFields`/`privilegedFields` usan `entry.phase` almacenado, por lo que las entradas existentes (con `Fase`) siguen validando y las nuevas guardan el valor completo. El mensaje de `approve` indica `Fase: <id>` (el gate acepta ambas formas).

## Fallos, seguridad y recuperación

| Fallo o amenaza | Detección | Respuesta | Recuperación |
|---|---|---|---|
| Hook desalineado entre checkouts (la copia del principal difiere de la del worktree) | `checkIntegrity()` (l.186-191) bloquea con "se está ejecutando otra copia del hook" | Ningún agente rodea el bloqueo | El usuario integra o alinea `.claude/hooks/spec-approval.mjs` en todos los checkouts antes de usar la rama y reinicia la sesión. Una copia anterior a la comprobación de integridad no lo detecta (SETUP l.273) |
| Firma legada de una spec con `Fase N` | `humanSigned` prueba el statement nuevo y luego el legado | Sigue válida si el hash coincide; no requiere re-firmar | Si falla, el usuario regenera con `statement` y firma de nuevo |
| Firma de otra spec, hash, fase o raíz | `sshVerified` falla | El gate bloquea | El usuario vuelve a firmar el statement actual |
| El cambio del hook bloquea por error cualquier acción (gate/guard) | Hook sale con código 2 sin causa legítima | Los agentes cierran la fase como BLOQUEADO; ninguno intenta otra vía | El usuario edita `.claude/settings.json` a mano (`onFailure: block` solo impide dejar pasar un hook roto) o revierte el commit del hook |
| Rollback del cambio | Pruebas de `.claude/hooks` o uso real | Revertir el commit del hook | Tras revertir, el statement vuelve a usar el primer token: las firmas hechas con el valor completo (solo en specs `Fase N`) dejan de valer y se regeneran con `node.exe .claude/hooks/spec-approval.mjs statement <spec>` y firma; el ledger conserva `phase` almacenado y no se edita |
| Fase B: `planOpen` por fase demasiado laxo o que bloquea de más | Pruebas negativas AC-B4..AC-B7 | BLOQUEADO; la fase actual no encontrada falla cerrada | Revertir el commit del hook |
| Hueco entre cerrar Fase A y cambiar a Fase B (autorización de Fase A aún abierta por tareas de Fase B) | Revisión del reviewer al cerrar Fase A | Cambiar `Fase actual` a `B` sin demora; la autorización caduca a las 2 h | Re-aprobar y re-autorizar para Fase B |
| Regresión que abre rutas protegidas | Pruebas negativas AC-10, AC-11, AC-14 y el reviewer sobre el diff real | BLOQUEADO | Revertir y re-aprobar |

## Criterios de aceptación

### Fase A

- [ ] AC-01 (RN-01) Dado una spec con `Fase actual: Fase 1`, cuando se imprime `statement`, entonces la quinta línea es `Fase 1`, y con `Fase actual: B` es `B`.
- [ ] AC-02 (RN-02) Dado la fase `Fase 1` aprobada y firmada, cuando el prompt declara `Fase: 1` o `Fase: Fase 1`, entonces el gate permite.
- [ ] AC-03 (RN-02, negativo) Dado la fase `Fase 1`, cuando el prompt declara `Fase: Fase`, `Fase: 10`, `Fase: 1.1` o `Fase: 2`, entonces el gate bloquea; y con fase `B` se bloquea `Fase: B.1` y con `B.1` se bloquea `Fase: B`.
- [ ] AC-04 (RN-02) Dado la fase `C`, cuando el prompt usa `Fase: C.`, `` `Fase: C` ``, `**Fase: C**`, `"Fase: C"` o varias specs en un prompt (`... Fase: B.1, docs/specs/b.md Fase: C`), entonces el comportamiento actual se conserva (pruebas existentes verdes).
- [ ] AC-05 (RN-01) Dado una spec sin valor en `Fase actual:`, cuando pasa por el gate, entonces no se exige declaración, como hoy.
- [ ] AC-06 (RN-01) Dado `apruebo` sobre una spec `Fase 1`, entonces la entrada del ledger guarda `phase: "Fase 1"` y el mensaje indica `Fase: 1`.
- [ ] AC-07 (RN-03) Dado una spec `Fase 1` con ledger y `.sig` firmada sobre el statement legado (fase `Fase`) y hash sin cambios, cuando pasa por el gate, entonces sigue válida sin re-firmar.
- [ ] AC-08 (RN-03, negativo) Dado esa misma `.sig` legada, cuando cambia cualquier contenido o `Fase actual` de la spec, entonces el gate bloquea; una firma sobre otra spec, otra raíz, otro hash o una fase que no es ni el valor completo ni el primer token también bloquea.
- [ ] AC-09 (RN-03, RN-05) Dado una spec `Fase 1`, cuando se ejecuta `autorizo gobierno`, entonces la entrada privilegiada guarda `phase: "Fase 1"`, `govStatement` muestra `fase: Fase 1` y solo desbloquea con `.gov.sig` válida; una entrada existente con `Fase` y su `.gov.sig` siguen validando.
- [ ] AC-10 (RN-04, RN-05, negativo) Dado una aprobación sin `.sig` o con `.sig` inválida, o `apruebo` sobre una spec que lista gobierno, entonces ninguna ruta sensible ni de gobierno se desbloquea; una firma funcional no sirve como `.gov.sig` y viceversa.
- [ ] AC-11 (RN-06, RN-07, negativo) Dado cualquier agente, cuando intenta editar `docs/specs/approvals.jsonl`, `spec-privileged.jsonl` o la clave, entonces se bloquea; con `Modo: build` una ruta sensible o de gobierno sigue bloqueada; una aprobación copiada a otro checkout no vale; el hash invalida cambios de contenido y de `Fase actual`.
- [ ] AC-12 (RN-07) Dado el gate con `Modo: build`, entonces una prueba de caracterización documenta el comportamiento actual sin exigir cambiarlo: con una spec citada por ruta, spec sin firma o cambiada bloquea y spec válida exige `Fase:` si la declara; sin ruta citada no se valida. La prueba pasa con el gate tal como está tras T1 (T1 no modifica la lógica de `Modo: build`).
- [ ] AC-13 (todos) Dado `npx vitest run .claude/hooks`, entonces pasan las 47 pruebas actuales más las nuevas.
- [ ] AC-14 (RN-12, negativo) Dado una spec aprobada, firmada y autorizada cuyo `## Cambios de gobierno` lista la ruta X y cuyo `## Gobierno afectado por fase` (tabla con rutas de otra fase en backticks) lista la ruta Y, entonces editar X se permite y editar Y se bloquea; además, en esta spec `## Cambios de gobierno` contiene exactamente las dos rutas de Fase A y ninguna de Fase B (verificación del reviewer sobre la spec con las reglas de `section()`).

### Fase B

- [x] AC-B1 (RN-09) Dado el cierre de una fase, entonces `orchestrator.md` y SETUP (Flujo SDD, paso 6) indican que el orquestador marca casillas del plan y AC tras el APROBADO del reviewer con evidencia por AC, que marcar no invalida la aprobación y que desmarcar está bloqueado.
- [x] AC-B2 (RN-10) Dado `developer.md`, `orchestrator.md` y SETUP, entonces indican usar Read/Grep/Glob y no Bash sobre `docs/specs` ni `grep record` sobre el hook, y registran como fuera de alcance una lista de lectura Bash (requeriría spec propia).
- [x] AC-B3 (RN-10) Dado SETUP, entonces documenta la recuperación por hook desalineado entre checkouts y el rollback de esta spec.
- [x] AC-B4 (RN-08, negativo) Dado `Fase actual: A`, `### Fase A` con todo marcado y tareas abiertas en `### Fase B`, cuando se edita una ruta sensible o de gobierno de Fase A, entonces se bloquea, y `autorizo gobierno` se rechaza: una fase cerrada no reutiliza permisos.
- [x] AC-B5 (RN-08) Dado `Fase actual: A` con una tarea abierta en `### Fase A`, entonces la autorización se mantiene aunque `### Fase B` esté vacía de abiertas; y con `Fase actual: B`, `### Fase B` sin tareas abiertas y tareas abiertas en `### Fase A`, entonces no autoriza (la fase actual sin tareas abiertas no autoriza).
- [x] AC-B6 (RN-08, negativo) Dado una spec autorizada, cuando se desmarca una casilla del plan, entonces sigue bloqueado (el hash lo invalida), también con subsecciones por fase.
- [x] AC-B7 (RN-08, negativo) Dado una sección `## Plan*` con subsecciones `### Fase` y `Fase actual` sin subsección coincidente (por ejemplo `Fase actual: C` con solo `### Fase A` y `### Fase B`, o `1` con solo `### Fase 10`), entonces `planOpen` es falso y no se autoriza nada, con un mensaje que lo indica; y sin ninguna subsección `### Fase` se usa toda la sección como hoy.
- [x] AC-B8 (RN-11) Dado `orchestrator.md` y SETUP, entonces indican que BUILD no puede usarse para evitar una aprobación SDD (si toca disparadores, rutas protegidas o gobierno se reclasifica a SDD), que en `Modo: build` la spec se cita por slug y no por ruta para evidencia UAT, y que citarla no la hace autorizadora.
- [x] AC-B9 (RN-12) Dado el cambio a `Fase actual: B`, entonces `## Cambios de gobierno` lista exactamente las cinco rutas de Fase B (y ninguna de Fase A), y se repiten aprobación, firma, `autorizo gobierno` y firma `.gov.sig` (verificación del reviewer sobre la spec al abrir la fase).
- [x] AC-B10 (RN-13) Dado SETUP («Pruebas y observaciones»), entonces contiene una frase que liga criticidad a urgencia/bloqueo (crítica: inmediata y bloquea la aceptación afectada; funcional: según impacto; mejora opcional: backlog) y dice que la criticidad no determina la ruta ni autoriza `Modo: build`. Negativo: una observación crítica no habilita `Modo: build` para tocar rutas protegidas ni de gobierno (RN-11); `docs/forms/uat.md` no se edita (verificación del reviewer sobre el diff).
- [x] AC-B11 (RN-14) Dado el PR de esta spec, entonces declara «UAT no aplicable» con justificación registrada y las verificaciones técnicas completas (commit exacto, APROBADO del reviewer, `npx vitest run .claude/hooks` verde sin omitir ninguna prueba, lint/build según la tabla del reviewer); el reviewer lo verifica sobre el diff real. Negativo: no se declara si el diff cambia comportamiento funcional observable, permisos, autorización o autenticación del producto; ante duda aplica el gate obligatorio.

## Trazabilidad

| RN | Contrato o tabla | AC | Prueba |
|---|---|---|---|
| RN-01 | Contratos (`phase`, `phaseId`) | AC-01, AC-05, AC-06 | `.claude/hooks/spec-approval.test.mjs` (fases con espacio) |
| RN-02 | Contratos (declared) | AC-02, AC-03, AC-04 | `.claude/hooks/spec-approval.test.mjs` |
| RN-03 | Tabla statement legado/nuevo | AC-07, AC-08, AC-09 | `.claude/hooks/spec-approval.test.mjs` (firma legada, negativas) |
| RN-04 | Gate y `humanSigned` | AC-10 | pruebas "external confirmation" existentes y nuevas |
| RN-05 | `authorize`, `govStatement` | AC-09, AC-10 | pruebas "governance" existentes y nuevas |
| RN-06 | `NEVER` | AC-11 | prueba "key material and signers" existente |
| RN-07 | Gate, `guard`, ledger por raíz | AC-11, AC-12, AC-13 | pruebas "sensitive", "root", "phases" existentes y la nueva de caracterización |
| RN-08 | `planOpen` | AC-B4, AC-B5, AC-B6, AC-B7 | `.claude/hooks/spec-approval.test.mjs` (negativas por fase) |
| RN-09 | Reglas de cierre | AC-B1 | Revisión del reviewer sobre el diff de los `.md` |
| RN-10 | Documentación | AC-B2, AC-B3 | Revisión del reviewer sobre el diff de los `.md` |
| RN-11 | Reglas de ruta | AC-B8 | Revisión del reviewer sobre el diff de los `.md` |
| RN-13 | SETUP «Pruebas y observaciones» (T3) | AC-B10 | Revisión del reviewer sobre el diff de los `.md` |
| RN-14 | SETUP «Obligatoriedad» / gate UAT | AC-B11 | Verificación del reviewer sobre el PR (diff, `npx vitest run .claude/hooks`, lint/build) |
| RN-12 | `section()`, `## Gobierno afectado por fase` | AC-14, AC-B9 | `.claude/hooks/spec-approval.test.mjs` (sección con título distinto) y revisión del reviewer sobre la spec |

## Matriz de pruebas

| Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
|---|---|---|---|---|---|
| Hook: fase, declared, firma legada, sección de gobierno por fase | Sí, `npx vitest run .claude/hooks` (gate, record, statement) | Sí: spawn del hook con ssh-keygen real, como las pruebas actuales | Manual del usuario: firma real con `~/.ssh/spec_approval` | Obligatoria: negativas de firma, hash, raíz, Modo: build, NEVER, sección no parseada | Rollback: revertir commit y re-firmar con `statement` (tabla de fallos) |
| Documentación (Fase B) | No | No | Lectura del reviewer | Coherencia con SETUP §3 | Revertir commit |
| `planOpen` por fase (Fase B) | Sí | Sí (spawn) | No | Obligatoria: negativas AC-B4..AC-B7 | Revertir commit |

## Cambios de gobierno

Solo los de la fase actual (Fase B). `.claude/settings.json` no se modifica. La aprobación funcional no los autoriza: requiere además `autorizo gobierno` y su firma `.gov.sig`.

- `.claude/hooks/spec-approval.mjs`
- `.claude/hooks/spec-approval.test.mjs`
- `.claude/agents/orchestrator.md`
- `.claude/agents/developer.md`
- `docs/SETUP.md`

## Gobierno afectado por fase

Esta sección no la lee el hook (su título no es `## Cambios de gobierno` ni empieza por `## Plan`, y las rutas van en tabla, no como viñetas). Existe porque el hook lee `## Cambios de gobierno` completo sin distinguir fase y la autorización cubre todas las rutas listadas durante 2 h en la sesión: listar aquí las de Fase B en `## Cambios de gobierno` las sobreautorizaría durante Fase A. La Fase B ya fue movida a `## Cambios de gobierno` (Fase A cerrada); las filas A quedan como histórico. Cada fase exige `apruebo` con firma `.sig` y además `autorizo gobierno` con firma `.gov.sig`.

| Fase | Archivo de gobierno | Cambio |
|---|---|---|
| A | `.claude/hooks/spec-approval.mjs` | `phase()`, `phaseId()`, `declared`, `humanSigned` legado, mensaje de `approve` |
| A | `.claude/hooks/spec-approval.test.mjs` | Pruebas de fase, firma legada, caracterización de `Modo: build`, sección con título distinto |
| B | `.claude/hooks/spec-approval.mjs` | `planOpen` por subsección de la fase actual |
| B | `.claude/hooks/spec-approval.test.mjs` | Pruebas negativas de `planOpen` por fase |
| B | `.claude/agents/orchestrator.md` | Marcado de AC, Read/Grep/Glob, regla BUILD y spec por slug |
| B | `.claude/agents/developer.md` | Read/Grep/Glob en lugar de Bash sobre `docs/specs` y sobre el hook |
| B | `docs/SETUP.md` | Cierre de fase, límites, regla BUILD, recuperación por hook desalineado, rollback |

Confirmado sin cambios en ninguna fase: `.claude/agents/spec.md`, `.claude/agents/reviewer.md`, `.claude/settings.json`.

## Plan de tareas

### Fase A
- [x] T1 — Hook: `phase()` valor completo, `phaseId()`, `declared` por coincidencia exacta con límite, `humanSigned` con statement legado, mensaje de `approve` con el id; sin tocar la lógica de `Modo: build` · archivos: `.claude/hooks/spec-approval.mjs` · depende de: — · secuencial (base)
- [x] T2 — Pruebas: fases con espacio (`Fase 1`, `Fase 10`, `1.1`), firma legada válida y negativas, ledger/gobierno con fase completa, caracterización de `Modo: build` con spec citada, sección `## Gobierno afectado por fase` no autoriza; las 47 existentes verdes · archivos: `.claude/hooks/spec-approval.test.mjs` · depende de: T1 · secuencial (mismo contrato; sus archivos son distintos pero T2 prueba lo que define T1)

Fase A: 2 tareas, 2 archivos. Sin paralelismo.

### Fase B
Fase actual. Pendiente aprobación (apruebo + .sig) y autorización de gobierno (.gov.sig).
- [x] T3 — Documentación de cierre y límites: quién marca los AC, Read/Grep/Glob, regla BUILD y spec por slug (Opción 0), recuperación por hook desalineado y rollback, y la frase criticidad→urgencia/bloqueo (RN-13) en SETUP · archivos: `.claude/agents/orchestrator.md`, `.claude/agents/developer.md`, `docs/SETUP.md` · depende de: Fase A cerrada · paralelizable con T4 (archivos disjuntos)
- [x] T4 — Hook: `planOpen` limitado a la subsección `### Fase <id>` de la `Fase actual`, con el fallback seguro de RN-08 · archivos: `.claude/hooks/spec-approval.mjs` · depende de: Fase A cerrada · paralelizable con T3
- [x] T5 — Pruebas de `planOpen` por fase y negativas AC-B4..AC-B7 · archivos: `.claude/hooks/spec-approval.test.mjs` · depende de: T4 · secuencial

Fase B: 3 tareas, 5 archivos. T3 y T4 son disjuntas y pueden ir en paralelo; T5 espera a T4.

División: una sola spec; Fase A entrega el error comprobado de forma autónoma; Fase B reúne `planOpen` y lo documental. No avanzar a Fase B hasta que Fase A esté cerrada y revisada. Mientras Fase B tenga casillas abiertas, la autorización de Fase A sigue abierta (hallazgo 4b), así que tras cerrar Fase A se cambia `Fase actual` a `B` sin demora.

## Comandos exactos del usuario

Los escribe y firma solo el usuario, en su sesión y su terminal. Ningún agente los ejecuta ni los envía.

1. Aprobación funcional de la fase actual, en el chat:

```
apruebo docs/specs/governance-sdd-reliability.md
```

2. Firma externa: en Git Bash (no PowerShell), desde la raíz del repo, el comando exacto que imprime el hook tras `apruebo`. Forma, para esta spec:

```bash
s=$(mktemp) && echo {} | node.exe .claude/hooks/spec-approval.mjs statement docs/specs/governance-sdd-reliability.md > "$s" && test -s "$s" && cat "$s" && ssh-keygen -Y sign -f ~/.ssh/spec_approval -n spec-approval "$s" && ssh-keygen -Y verify -f ~/.claude/spec-allowed-signers -I approver -n spec-approval -s "$s.sig" < "$s" && mv "$s.sig" docs/specs/governance-sdd-reliability.md.sig && echo "Firma verificada: docs/specs/governance-sdd-reliability.md.sig" || echo "ERROR: firma no creada; docs/specs/governance-sdd-reliability.md.sig sin cambios" >&2; rm -f "$s" "$s.sig"
```

3. Autorización de gobierno (obligatoria para editar los archivos de `## Cambios de gobierno` de la fase actual), en el chat:

```
autorizo gobierno docs/specs/governance-sdd-reliability.md
```

4. Firma de la autorización: el hook imprime el comando, que añade `gobierno <session_id>` a `statement` y escribe `docs/specs/governance-sdd-reliability.md.gov.sig`. Antes de firmar, comprobar que `sesion:` coincide con `/status` y revisar `rutas:` y `caduca:` (2 h).
5. Antes de implementar: alinear `.claude/hooks/spec-approval.mjs` en todos los checkouts que se usen (hallazgo 6) y reiniciar la sesión.
6. Para Fase B: el cambio de `Fase actual` a `B` y de las rutas de `## Cambios de gobierno` ya se hizo (agente `spec`, en borrador); los pasos 1 a 4 aplican ahora a Fase B.

## Preguntas abiertas

Ninguna.

## Definition of Done

AC de la fase con evidencia en el veredicto del reviewer; lo no ejecutado de la matriz figura como NO EJECUTADO con su motivo. Fase A: `npx vitest run .claude/hooks` verde (47 actuales más las nuevas) y diff limitado a los dos archivos listados; el PR de Fase A debe registrar explícitamente «UAT no aplicable» con justificación y verificaciones técnicas completas, únicamente cuando cumpla las condiciones vigentes de `docs/SETUP.md` («Obligatoriedad y UAT no aplicable»); ante cualquier duda o impacto que obligue a UAT, se aplica el gate funcional. Fase B: diff limitado a los cinco archivos de su fila en `## Gobierno afectado por fase`. El PR declara «UAT no aplicable» con justificación y verificaciones técnicas completas (RN-14); ninguna prueba del hook se omite.
