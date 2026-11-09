# Template V2 Fase C: optimización ODD + SDD

- Módulo: template
- Estado: aprobado
- ID: SPEC-template-v2-odd-sdd-optimization
- Riesgo: medio (cambia instrucciones de agentes y `docs/SETUP.md`; no toca hooks, settings, firmas ni aprobaciones)
- Ruta: SDD-ADVANCED (disparador: agentes y `docs/SETUP.md`)
- Fase actual: C
- Fuente: `docs/proposals/odd-sdd-alignment.md` y `template v2.1/INSTRUCCION_CLAUDE_CODE_TEMPLATE_V2_PRO_SDD_ODD_TOKEN_EFFICIENT.md` (rama `backup/template-v2-wip-2026-11-06`)
- Decisión de orden: opción A del usuario (2026-11-07). La Fase C mínima va antes de AUTH-2. Su implementación espera a que concluya la revisión de AUTH-1 (ver "Condiciones previas"). `docs/specs/template-v2-professional-workflow.md` no se edita.

## Objetivo

Consolidar ODD + SDD como metodología operativa del template. La meta es reducir lecturas de contexto, verificaciones duplicadas y tiempo hasta un resultado verificable, sin debilitar ningún control de gobierno.

## Alcance

Incluye:

- **ODD-LIGHT.** Recuperar el nombre y la definición: desarrollo adaptativo orientado al resultado. BUILD sigue siendo el mecanismo de ejecución, con la misma ruta, los mismos controles y la línea literal `Modo: build`.
- **G1 Verificación.** El developer ejecuta pruebas focalizadas. El reviewer ejecuta una sola vez la verificación integral que exige el riesgo del diff.
- **G2 Contexto.** El developer y el agente spec leen de `docs/SETUP.md` solo las secciones que necesitan, conservando el conocimiento obligatorio.
- **G3 SDD-ADVANCED.** Una plantilla con IDs y trazabilidad, y una matriz de pruebas proporcional al riesgo, con detalle para auth y bases de datos.
- **G4 y G5 Resultados.** Estados PASS / FAIL / NO EJECUTADO, cierre de fase conciso y brief mínimo entre agentes.

No incluye:

- `.claude/hooks/`, `.claude/settings.json`, `CLAUDE.md`, `AGENTS.md`, `docs/specs/approvals.jsonl`, firmas, `vitest.config.mts`, `package.json`, `package-lock.json`.
- El frontmatter (`name`, `description`, `tools`) de los cuatro agentes: es configuración que ejecuta el harness, no texto de instrucciones.
- Agentes, hooks, tipos de autorización, `.claude/rules/` o skills nuevos.
- Clerk, Neon, MADRE, auth, usuarios o roles.
- Trabajo de Fases D y E (ver "Separación de Fases D y E").
- Commit, push, PR, merge o release sin orden expresa.

## Diagnóstico

Base: `main` en `18e3dc6`. Detalle y evidencia `archivo:línea` en `docs/proposals/odd-sdd-alignment.md` §2.

| ID | Brecha | Estado actual | Efecto |
|---|---|---|---|
| ODD | El nombre ODD-LIGHT del diseño v2.1 no aparece en el template | `docs/SETUP.md:228` y `orchestrator.md:27` solo dicen BUILD | Se pierde el criterio "orientado al resultado": la ruta se percibe como una excepción del SDD. |
| G1 | Verificación duplicada | `developer.md:34-40` y `reviewer.md:24-30` ejecutan los dos `npx vitest run`, `npm run lint` y `npm run build` completos | Dos builds y dos suites (con los 47 tests del hook) por ciclo. Cada corrección los repite. Un diff solo de Markdown también se construye dos veces. |
| G2 | Lectura completa de `docs/SETUP.md` (26,6 KB) | `developer.md:6`, `spec.md:7` | El developer lee 17,3 KB de §3. Casi todo es gobierno que el hook ya hace cumplir. |
| G3 | Sin plantilla SDD-ADVANCED ni matriz de pruebas por riesgo | `spec.md:18` (una línea); `docs/SETUP.md:401-427` (solo unit tests) | La spec de auth sería la primera SDD-ADVANCED de producto y el agente spec improvisaría su estructura y sus pruebas de seguridad. |
| G4 | Salidas sin estado por comando ni cierre fijo | `developer.md:57`, `orchestrator.md:49` | No se distingue lo que pasó de lo que no se ejecutó. Continuar en una sesión nueva exige releer mucho. |
| G5 | Brief incompleto | `orchestrator.md:70-71` | El brief puede omitir archivos vetados o pruebas exigidas. |

## Decisiones

- **D1. ODD-LIGHT es el nombre de la ruta y BUILD su mecanismo.** La tabla de rutas dice `BUILD (ODD-LIGHT)`. El formato `RUTA:` del orquestador y la línea `Modo: build` no cambian, porque el hook depende de esa línea.
- **D2. Verificación integral por riesgo, una vez.** La decide el reviewer según la categoría de cada archivo del diff (D7). El developer nunca ejecuta `npm run build` ni la suite completa.
- **D3. Sin `tsc` en el developer.** `npm run build` es el único chequeo completo de tipos, porque los tipos de rutas se generan en `.next/types`. Un error de tipos puede costar un ciclo. Se mide en Fase E.
- **D4. Lectura parcial solo para developer y spec.** El orquestador y el reviewer siguen leyendo `docs/SETUP.md` completo, porque aplican el gobierno.
- **D5. Sin dividir `docs/SETUP.md`.** Las secciones se citan por título; no se crean archivos nuevos de reglas.
- **D6. Los bloqueos se respetan.** Las ediciones las hace `developer` con la autorización de gobierno de la sesión. Que un subagente herede el `session_id` figura como NO VERIFICADO en la evidencia de Fase B.
  - Si `guard`, `gate`, `relay` o un permiso bloquean al developer, este se detiene y lo informa. El orquestador cierra la fase como BLOQUEADO.
  - Ningún agente intenta otra vía: ni Bash o PowerShell sobre rutas protegidas, ni otra sesión, ni una copia del hook, ni otro agente.
  - No hay alternativa manual por defecto. Solo existe si el usuario la permite expresamente en el chat para esta spec, después del bloqueo. Por ejemplo: que el agente prepare un parche en `docs/patches/` y el usuario lo revise y lo aplique él mismo.
  - El agente nunca aplica ese parche. La alternativa no sustituye `apruebo`, `autorizo gobierno` ni sus firmas, y no es un mecanismo para eludir el gate.
- **D7. Tres categorías de archivo para verificar en proporción al riesgo:**

  | Categoría | Archivos | Riesgo |
  |---|---|---|
  | Documentación informativa | `docs/proposals/`, `docs/evidence/`, `README.md` y otro Markdown que ningún agente lee como regla | Bajo: no cambia comportamiento |
  | Instrucciones de agentes | Cuerpo de `.claude/agents/*.md`, `docs/SETUP.md`, `CLAUDE.md`, `AGENTS.md`, `docs/templates/` | Medio: cambia lo que hacen los agentes, pero no los controles |
  | Gobierno ejecutable | `.claude/hooks/`, `.claude/settings*.json`, `.mcp.json` y el frontmatter de `.claude/agents/*.md` | Alto: cambia lo que el harness permite o bloquea |

  Un archivo de categoría dudosa se trata como la más alta. Instrucciones de agentes y gobierno ejecutable siguen siendo archivos de gobierno para la autorización (`docs/SETUP.md`, "Autorizaciones"). D7 solo gradúa la verificación, no la autorización.
- **D8. Controles que se conservan íntegros.** Esta spec no cambia:
  - la aprobación `apruebo` con firma SSH;
  - la autorización `autorizo gobierno` con su propia firma, su sesión y su caducidad;
  - el ledger;
  - `guard`, `gate`, `relay`, `deny`, `ask` y `onFailure: block`;
  - las rutas sensibles y de gobierno;
  - los disparadores de riesgo y la escalada de BUILD a SDD;
  - las secciones "Autorizaciones" y "Riesgos residuales" de `docs/SETUP.md`.
- **D9. Verificación de instrucciones de agentes.** Decisión del usuario, 2026-11-07. Cuando el diff cambia instrucciones de agentes, el reviewer hace cuatro cosas:
  1. Ejecuta los tests focalizados del hook: `npx vitest run .claude/hooks`. Comprueban que los controles que esas instrucciones citan siguen bloqueando.
  2. Si el diff es solo Markdown, no ejecuta `npm run lint` ni `npm run build`, y los registra como NO EJECUTADO con ese motivo.
  3. Comprueba la coherencia entre instrucciones, rutas, restricciones y documentación:
     - las rutas protegidas y de gobierno citadas coinciden con `docs/SETUP.md`, "Autorizaciones";
     - los nombres de sección que citan los agentes existen en `docs/SETUP.md`;
     - `Modo: build`, `Fase:`, `apruebo` y `autorizo gobierno` se citan igual que en el hook;
     - ningún agente contradice a otro ni a `docs/SETUP.md`.
  4. Registra cada comprobación como PASS, FAIL o NO EJECUTADO, con la evidencia: salida resumida o `archivo:línea`.

  Si un test del hook falla, el veredicto es BLOQUEADO. Nunca se modifica un hook ni un test para que pase.

## Cambios concretos por archivo

### `docs/SETUP.md`

- **Rutas de trabajo:** la fila BUILD pasa a `BUILD (ODD-LIGHT)`. Se añade una frase antes de la tabla:
  > ODD-LIGHT: desarrollo adaptativo orientado al resultado. Cambio pequeño y reversible, verificado por su resultado, sin spec. Se ejecuta con `Modo: build` y conserva todos los controles: si crece o toca un disparador, pasa a SDD.

  Los criterios de la fila no cambian.
- **Ejecución en paralelo:** la frase "Los developers en paralelo solo tocan sus archivos, verifican con `vitest`/`eslint` sobre ellos y no ejecutan `build`" pasa a valer para todo developer, en paralelo o no. Se añade que la verificación integral la ejecuta el reviewer una vez por revisión, según la tabla de su agente.
- **Plantilla de spec:** se añade una línea: "Para SDD-ADVANCED, usar además `docs/templates/spec-advanced.md`." No se copia su contenido.

### `.claude/agents/developer.md`

- **Línea 6:** "Lee `docs/SETUP.md` completo antes de escribir código" se sustituye por:
  > Lee de `docs/SETUP.md` las secciones 1 y 2 y, de la sección 3, "Ejecución en paralelo" y "Unit testing". El resto de la sección 3 (gobierno) lo aplican los hooks y el reviewer: léelo solo si un hook te bloquea.
- **Conocimiento obligatorio que no se toca:** las reglas de `developer.md` sobre rutas protegidas, `docs/specs/` de solo lectura, no hacer commits, comprobar `Estado: aprobado` y los modos.
- **Verificación:** un solo bloque para todos los modos:
  - `npx vitest run <tests de tus archivos o relacionados>`;
  - `npx eslint <tus archivos>`;
  - sin `npm run build` ni `npx vitest run` sin argumentos;
  - si tocaste `.claude/hooks/`, añade `npx vitest run .claude/hooks`.

  En modo paralelo sigue prohibido instalar dependencias.
- **Respuesta:** este formato:

  ```text
  CAMBIOS: ruta1, ruta2
  REUTILIZADO / SHADCN: ...
  PRUEBAS: <comando> → PASS | FAIL | NO EJECUTADO (motivo)
  CRITERIOS: AC-xx → cumplido | pendiente
  DESVIACIONES / PENDIENTES: ...
  ```

### `.claude/agents/reviewer.md`

- **Paso 7:** "Ejecuta tú mismo la verificación completa" se sustituye por la verificación integral, una vez por revisión. Se aplica la fila más alta que toque el diff, con las categorías de D7:

  | El diff toca | Ejecuta |
  |---|---|
  | Solo documentación informativa | `git diff --check` |
  | Instrucciones de agentes | D9: `git diff --check`; `npx vitest run .claude/hooks`; confirmar con `git diff` que el frontmatter de los agentes, `.claude/hooks/` y `.claude/settings*.json` no cambian; revisar la coherencia entre instrucciones, rutas, restricciones y documentación. Sin lint ni build si el diff es solo Markdown |
  | Código, estilos o configuración de la app, `package*.json` | `npx vitest run` (incluye los tests del hook), `npm run lint`, `npm run build` |
  | Gobierno ejecutable | Lo anterior, más las pruebas negativas de `gate`, `guard` y `relay` que exija la spec |
  | Rutas sensibles o disparadores SDD-ADVANCED | Lo anterior, más las pruebas de integración y seguridad de la matriz de la spec |

  En caso de duda, se aplica la fila más alta. Lo que no se ejecuta figura como NO EJECUTADO con su motivo. Los pasos 2 a 6 de `reviewer.md` (gobierno, aprobación, alcance, checklist, duplicación) se aplican siempre, en cualquier fila.
- **Respuesta:** tras el veredicto, una línea por comando: `<comando> → PASS | FAIL | NO EJECUTADO (motivo)`.
- **Sin cambios:** la lectura completa de `docs/SETUP.md`, la revisión de gobierno y del diff real, y los veredictos.

### `.claude/agents/spec.md`

- **Línea 7:** "Lee `docs/SETUP.md` completo" se sustituye por:
  > Lee de `docs/SETUP.md` las secciones 1 y 2 y, de la sección 3, "Rutas de trabajo", "Planes alcanzables", "Ejecución en paralelo", "Plantilla de spec" y "Unit testing". Si la spec lista rutas sensibles o de gobierno, lee también "Autorizaciones".
- **Línea 18:** "SDD-ADVANCED añade…" se sustituye por:
  > SDD-ADVANCED usa además `docs/templates/spec-advanced.md`, solo con las secciones que apliquen.

### `docs/templates/spec-advanced.md` (nuevo)

Plantilla en bloque Markdown, compatible con el hook y con `docs/SETUP.md`:

- **Cabecera:** `Módulo`, `Estado: borrador`, `ID`, `Riesgo`, `Ruta`, `Fase actual`.
- **Secciones**, solo las que apliquen; una sección que no aplica se omite, no se deja vacía:
  - Objetivo;
  - Alcance y reglas `RN-xx`;
  - Actores y matriz de acceso;
  - Diseño y dependencias;
  - Contratos y datos;
  - No funcionales;
  - Fallos, seguridad y recuperación;
  - Criterios `AC-xx` en Dado/cuando/entonces;
  - Trazabilidad;
  - Matriz de pruebas;
  - `## Archivos sensibles`, `## Cambios de gobierno`, `## Plan de tareas`, Preguntas abiertas y Definition of Done.
- **Trazabilidad:** tabla `RN → contrato o tabla → AC → prueba`.
- **Matriz de pruebas por riesgo**, tomada de `v2.1 §7`:

  | Cambio | Unit | Integración | E2E / manual | Seguridad | Migración / rollback |
  |---|---|---|---|---|---|
  | Visual local | Si hay lógica | No | Smoke visual | No | No |
  | Formulario o CRUD aislado | Sí | API/DB si aplica | Feliz y negativo | Si hay auth | Si cambia DB |
  | Auth, sesión, RBAC | Policies | Sesión + DB + webhooks | Acceso por perfil | Obligatoria: IDOR, escalada horizontal y vertical, rol revocado | Según cambios |
  | Esquema de base de datos | Validaciones | Constraints, FK, transacciones | Flujo crítico | Acceso por tenant si existe | Obligatorio: plan expand → migrate → contract y reversión, probados solo en base local o desechable |
  | Pagos o transacciones | Cálculos y estados | Atomicidad, idempotencia, reintentos | Caso crítico | Obligatoria | Si cambia DB |

- **Regla de controles críticos:** cada control crítico tiene al menos un AC negativo con su prueba.
- **Regla de migraciones**, escrita literalmente en la plantilla:
  > La plantilla exige planes y pruebas de migración cuando correspondan. Ni la plantilla ni una spec aprobada autorizan por sí mismas migraciones, DDL, seeds o borrados en una base real, compartida o de producción. Eso requiere una orden expresa del usuario para esa operación (`docs/SETUP.md`, "Autorizaciones").

### `.claude/agents/orchestrator.md`

- **Título de la sección 2:** pasa a "Ruta BUILD (ODD-LIGHT)". El paso 2 indica que el reviewer hace la única verificación integral (G1).
- **Bloqueos:** a la regla de la línea 71 ("Si te bloquea, no intentes rodearlo") se añade que un bloqueo de un subagente cierra la fase como BLOQUEADO y que solo el usuario decide cómo seguir (D6).
- **Regla de la línea 70:** se añade el brief mínimo. Cada agente recibe: modo, ruta de la spec y `Fase: <fase>` o `Modo: build`, tarea y AC, archivos propios, archivos vetados, pruebas exigidas y prohibiciones. Se pasa la ruta de la spec, no su contenido.
- **Cierre, paso 6:** en 10 líneas como máximo:

  ```text
  FASE / RUTA / ESTADO: ... | COMPLETADO | PARCIAL | BLOQUEADO
  CAMBIOS: rutas
  VERIFICACIÓN: <comando> → PASS | FAIL | NO EJECUTADO (motivo)
  REVISIÓN: veredicto y número de ciclos
  PENDIENTES / RIESGOS: ...
  SIGUIENTE GATE: ...
  ```

## Criterios de aceptación

Cada AC indica entre corchetes cómo se comprueba.

- [ ] AC-01 (ODD) Dado `docs/SETUP.md`, entonces la fila de rutas dice `BUILD (ODD-LIGHT)` y la definición de D1 precede a la tabla. Las celdas "Cuándo" y "Flujo" y la línea de disparadores de riesgo no cambian. [lectura + `git diff docs/SETUP.md`]
- [ ] AC-02 (ODD) Dado `orchestrator.md`, entonces su sección 2 se titula "Ruta BUILD (ODD-LIGHT)" y la regla que exige la línea literal `Modo: build` no cambia. [lectura + `git diff`]
- [ ] AC-03 (G1) Dado el bloque de verificación de `developer.md`, entonces no contiene `npm run build` ni `npx vitest run` sin argumentos, y sí `npx vitest run <…>` y `npx eslint <…>`. [búsqueda en el archivo]
- [ ] AC-04 (G1, G4, D9) Dado `reviewer.md`, entonces contiene:
  - la tabla de D7 con sus 5 filas;
  - la fila de instrucciones de agentes con los tests del hook y la revisión de coherencia de D9;
  - "una vez por revisión" y "en caso de duda, la fila más alta";
  - que los pasos 2 a 6 se aplican siempre;
  - que un test del hook que falla da BLOQUEADO y que nunca se modifica un hook para que pase;
  - el formato `<comando> → PASS | FAIL | NO EJECUTADO`.

  [lectura]
- [ ] AC-05 (G2) Dado `developer.md`, entonces no contiene "`docs/SETUP.md` completo" y lista las secciones de lectura de G2. Las líneas de modos (8-14), rutas protegidas (18), commits (24) y `docs/specs/` (25) no cambian. [`git diff` sin cambios en esas líneas]
- [ ] AC-06 (G2, G3) Dado `spec.md`, entonces lista sus secciones de lectura, lee "Autorizaciones" solo si la spec lista rutas protegidas y apunta a `docs/templates/spec-advanced.md`. [lectura]
- [ ] AC-07 (G3) Dada `docs/templates/spec-advanced.md`, entonces contiene:
  - la cabecera y las secciones de este documento;
  - la tabla de trazabilidad;
  - la matriz, con seguridad obligatoria en auth y migración obligatoria en base de datos;
  - la regla de migraciones literal, incluida la frase de que la plantilla no autoriza migraciones reales.

  [lectura]
- [ ] AC-08 (G4, G5) Dados `developer.md` y `orchestrator.md`, entonces contienen el formato PASS / FAIL / NO EJECUTADO, el bloque de cierre ocupa ≤ 10 líneas y el brief lista los 7 campos de G5. [lectura y conteo de líneas]
- [ ] AC-09 (G1, G3) Dado `docs/SETUP.md`, entonces "Ejecución en paralelo" aplica la verificación focalizada a todo developer y "Plantilla de spec" tiene una sola línea de puntero, sin copiar la plantilla. [lectura]
- [ ] AC-10 (D8) Dados `git status --short --ignored` y `git diff`, entonces:
  - solo cambian los 6 archivos del plan, más el parche de `docs/patches/` solo si el usuario lo permitió expresamente (D6);
  - el frontmatter (bloque `---` inicial) de los cuatro agentes no cambia;
  - en `docs/SETUP.md` solo cambian "Rutas de trabajo", "Ejecución en paralelo" y "Plantilla de spec";
  - "Autorizaciones" y "Riesgos residuales" quedan idénticas;
  - hooks, settings, `approvals.jsonl` y `.sig` no cambian.

  [`git diff`]
- [ ] AC-11 (G1, D9) Dada la tabla de D7 aplicada a este diff, que es de instrucciones de agentes y solo Markdown, entonces dan PASS, con evidencia:
  - `git diff --check`;
  - `npx vitest run .claude/hooks` (47 tests, sin cambiar aserciones ni hooks);
  - la comprobación de frontmatter, hooks y settings;
  - la revisión de coherencia de D9.

  `npm run lint` y `npm run build` figuran como NO EJECUTADO (motivo: solo Markdown). [veredicto del reviewer]
- [ ] AC-12 (D6) Dada la autorización de gobierno de la sesión, cuando `developer` edita un archivo de `## Cambios de gobierno`, entonces el cierre registra uno de dos resultados:
  - PASS: el subagente hereda la sesión;
  - BLOQUEADO: la fase se detiene sin ninguna edición de gobierno por otra vía (`git diff` lo demuestra) y queda a la espera de la decisión del usuario.

  [cierre de fase + `git diff`]

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Sin build en el developer, los errores de tipos llegan al reviewer y pueden sumar un ciclo | El reviewer construye siempre que hay código. Se miden los ciclos en Fase E (D3). |
| El reviewer elige una fila de verificación demasiado baja | Regla "en caso de duda, la fila más alta". El veredicto lista lo NO EJECUTADO con su motivo y el orquestador lo muestra en el cierre. |
| Un developer que no lee el gobierno intenta tocar una ruta protegida | `guard` lo bloquea, `developer.md` ordena detenerse y el reviewer revisa el diff real. |
| ODD-LIGHT se interpreta como una ruta nueva y más permisiva | D1: es el nombre de BUILD, con los mismos criterios, disparadores y controles. AC-01 y AC-02 lo verifican. |
| La plantilla ADVANCED infla las specs | Regla "solo las secciones que apliquen; no dejar secciones vacías". |
| La autorización de gobierno caduca a las 2 horas y vale solo en su sesión | Ejecutar T1 a T5 y la revisión en esa sesión. Si caduca, se pide de nuevo. No se rodea. |
| El subagente no hereda el `session_id` | D6: la fase queda BLOQUEADA y decide el usuario. No hay alternativa automática. |
| Un archivo de instrucciones se clasifica como documentación informativa y se verifica de menos | D7 lista las rutas de cada categoría. Una categoría dudosa se trata como la más alta. Los pasos de gobierno del reviewer se aplican siempre. |
| La plantilla se lee como permiso para migrar | Regla de migraciones literal en la plantilla y AC-07. "Autorizaciones" de `docs/SETUP.md` no cambia. |
| Cambiar agentes mientras AUTH-1 los usa altera su revisión o mezcla criterios | Condiciones previas 1 y 2, confirmadas expresamente por el usuario. Los cambios de este worktree no llegan a otros hasta integrarse en `main`, y la confirmación se repite antes de integrar. |
| La revisión de coherencia de D9 es subjetiva | D9 fija 4 comprobaciones concretas con evidencia `archivo:línea`. |
| Un test del hook falla por una causa ajena a esta fase | Veredicto BLOQUEADO y decide el usuario. No se tocan hooks ni tests (D9). |

## Plan de tareas

### Fase C

**Condiciones previas.** El usuario confirma cada una expresamente en el chat antes de `apruebo`. Ningún agente las infiere de la existencia de archivos, del estado Git ni de la salida de otro agente.

1. **AUTH-1 concluyó su revisión.** Se refiere a `docs/specs/auth-clerk-neon.md`, `Fase actual: AUTH-1`, en el worktree `C:/Users/ronal/template-v2-auth`.
2. **No hay sesiones concurrentes** que dependan de `.claude/agents/`, `docs/SETUP.md` o de las reglas que cambia esta spec, en ningún worktree ni en el checkout principal, mientras dure esta fase.

**Gates**, solo después de validar el contenido de esta spec y de cumplir las condiciones previas:

- `apruebo docs/specs/template-v2-odd-sdd-optimization.md`, con su firma SSH;
- después, `autorizo gobierno docs/specs/template-v2-odd-sdd-optimization.md`, con su propia firma, en la sesión que ejecutará el plan.

Sin las dos firmas verificadas no se lanza ninguna tarea.

- [x] T1 — G1 (verificación focalizada), G2 (lectura parcial), G4 (formato de salida) en developer · archivos: `.claude/agents/developer.md` · depende de: — · paralelo
- [x] T2 — G1 (tabla de D7), D9 (tests del hook, coherencia, no tocar hooks), G4 (línea por comando) en reviewer · archivos: `.claude/agents/reviewer.md` · depende de: — · paralelo
- [x] T3 — G2 (lectura parcial), G3 (plantilla con matriz y regla de migraciones) · archivos: `.claude/agents/spec.md`, `docs/templates/spec-advanced.md` · depende de: — · paralelo
- [x] T4 — ODD-LIGHT (título), G1 (verificación única en BUILD), G4 (cierre), G5 (brief), D6 (bloqueos) en orquestador · archivos: `.claude/agents/orchestrator.md` · depende de: — · paralelo
- [x] T5 — ODD-LIGHT (fila y definición), G1 (verificación para todo developer), G3 (puntero) en SETUP · archivos: `docs/SETUP.md` · depende de: T1, T3 · secuencial

Después: una revisión del reviewer con AC-10 y AC-11, máximo 3 ciclos de corrección, cierre en el formato nuevo y sin commit.

## Plan de validación y comparación antes / después

**Validación de esta fase:** AC-01 a AC-12 en el veredicto del reviewer. Las pruebas se limitan a las de AC-11. No hay unit tests nuevos, porque no cambia código ejecutable.

**Comparación estática.** Se calcula sobre el diff, sin ejecutar nada.

| Métrica (un ciclo BUILD) | Antes (`18e3dc6`) | Después (esperado) |
|---|---|---|
| Bytes de `docs/SETUP.md` que lee el developer | 26 595 | ≈ 10 500 (§1–2, "Ejecución en paralelo", "Unit testing") |
| Bytes de `docs/SETUP.md` que lee el agente spec | 26 595 | ≈ 13 300; ≈ 19 500 con "Autorizaciones" |
| `npm run build` por ciclo | 2 | 1 si hay código; 0 si solo hay documentación o instrucciones de agentes |
| Suite completa de `vitest` por ciclo | 2 | 1 si hay código o gobierno ejecutable; solo `.claude/hooks` si hay instrucciones de agentes (D9); 0 si solo hay documentación informativa |
| Subagentes en BUILD | 2 | 2 (sin cambio: el reviewer detecta escrituras por shell) |

**Comparación dinámica:** queda para la Fase E (ver más abajo). No se publica ningún porcentaje de ahorro de tokens hasta medirlo.

## Procedimiento de reversión

No hay commit, así que la reversión es local y la hace el usuario. Revierte archivos de gobierno, y un agente no puede rodear `guard` por shell.

1. Restaurar los cinco archivos existentes desde la base:

   ```bash
   git checkout 18e3dc6 -- .claude/agents/developer.md .claude/agents/reviewer.md .claude/agents/spec.md .claude/agents/orchestrator.md docs/SETUP.md
   ```

2. Eliminar el archivo nuevo: `rm docs/templates/spec-advanced.md`, y el parche de `docs/patches/` si el usuario permitió crearlo (D6).
3. Comprobar que `git status --short` solo muestra la spec y la propuesta.
4. Si el cambio ya se hubiera integrado por orden expresa: `git revert <sha>` en una rama nueva, con su propio PR.

La reversión no toca `approvals.jsonl` ni las firmas. Volver a aplicar el cambio después exige una nueva aprobación.

## Separación de Fases D y E

Fuera del alcance de esta spec. Cada una requiere su propia spec y su propia aprobación.

**Fase D — Seguridad y pruebas del sistema de agentes:**

- En sesión real: una spec aprobada con `## Archivos sensibles` desbloquea solo esas rutas. Se propone validarlo dentro de la primera fase de la spec de auth.
- Qué copia del hook corre en una sesión de escritorio con worktree (`docs/SETUP.md:271`).
- `autorizo gobierno` de extremo a extremo en sesión real. AC-12 de esta spec aporta un dato parcial.
- Mutación y revisión independiente de `fix-1`; mutación de `fix-2b`.
- NO VERIFICADO de baja prioridad: reglas `PowerShell(...)`, `::$DATA`, symlinks y mensajes entre sesiones.

**Fase E — Benchmark:**

- B01 (metadata y estilo, ruta ODD-LIGHT): `18e3dc6` frente al resultado de esta fase, en worktrees separados, con el mismo modelo y esfuerzo.
- B03: se mide sobre la spec de auth real, no sobre un caso sintético.
- Métricas: delegaciones, ciclos reviewer ↔ developer, builds ejecutados, tiempo hasta un resultado verificable y uso real reportado por la versión instalada de Claude Code.
- B02 y B04 solo si B01 y B03 no permiten concluir.

## Observaciones pendientes

Registradas por decisión del usuario el 2026-11-07. No amplían el alcance de esta fase.

- **OBS-01, AUTH-1.** En el worktree `C:/Users/ronal/template-v2-auth`, `docs/specs/approvals.jsonl` tiene cambios sin commit. Antes de cerrar esa fase, el reviewer de AUTH-1 debe determinar si son registros legítimos del mecanismo de aprobación o modificaciones indebidas. No se descartan ni se revierten automáticamente: lo que se haga con ellos lo decide el usuario según ese veredicto. Esta spec no interviene en ese worktree.
- **OBS-02, deuda documental.** `CLAUDE.md` dice que el bloqueo del developer sobre `docs/specs/` está "enforced by a hook in its frontmatter". Según `docs/SETUP.md` ("Bloqueo técnico"), hoy se aplica por `agent_type` desde `.claude/settings.json`, y `developer.md` no tiene hooks en su frontmatter. La referencia parece desactualizada. Queda como deuda documental independiente, para tratar con su propio cambio y su propia autorización de gobierno. No justifica ampliar el alcance de la Fase C ni modificar `CLAUDE.md` en ella.

## Archivos sensibles

Ninguno.

## Cambios de gobierno

- `.claude/agents/developer.md`
- `.claude/agents/reviewer.md`
- `.claude/agents/spec.md`
- `.claude/agents/orchestrator.md`
- `docs/SETUP.md`

## Definition of Done

AC-01 a AC-12 con evidencia en el veredicto del reviewer y en el cierre de fase. Lo no demostrado figura como NO VERIFICADO. Sin cambios fuera de los 6 archivos del plan, salvo un parche que el usuario haya permitido expresamente (D6). Hooks, settings, firmas y aprobaciones intactos. Sin commit, push ni PR sin orden expresa.
