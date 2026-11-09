# Propuesta: alineación ODD + SDD de Template V2 PRO

- Tipo: propuesta informativa. **No es normativa, no es una spec y no autoriza implementaciones.**
- Fecha: 2026-11-07
- Rama: `docs/odd-sdd-alignment` (base `main` en `18e3dc6`, Fase B cerrada)
- Modo: READ-ONLY. Solo se creó este archivo.

## Fuentes

| Fuente | Ubicación |
|---|---|
| Diseño original v2.1 | `origin/backup/template-v2-wip-2026-11-06:template v2.1/INSTRUCCION_CLAUDE_CODE_TEMPLATE_V2_PRO_SDD_ODD_TOKEN_EFFICIENT.md` (citado como `v2.1 §n`) |
| Reglas vigentes | `docs/SETUP.md` (427 líneas, 26,6 KB; la §3 ocupa 17,3 KB, el 65 %) |
| Agentes | `.claude/agents/orchestrator.md`, `developer.md`, `spec.md`, `reviewer.md` |
| Contexto de fases | `docs/specs/template-v2-professional-workflow.md`, `docs/evidence/template-v2-phase-b.md`, `.claude/settings.json` |

No se ejecutaron pruebas de software. Las cifras de tokens son **estimaciones por tamaño de archivo (≈ 4 bytes por token)**, no mediciones.

## 1. Resumen

- El enrutamiento de 4 rutas y el gobierno ya funcionan. El gobierno supera al diseño original: firma SSH externa, `guard` por archivo real, `relay`, `permissions.ask` y `onFailure: block`.
- BUILD / ODD-LIGHT existe y es seguro, pero **no es ligero**. Un cambio de una línea lanza dos subagentes. Cada agente lee `docs/SETUP.md` completo. Se ejecutan dos `npm run build` y dos `npx vitest run` completos (incluidos los 47 tests del hook).
- Las brechas con valor real son pocas: (1) la verificación duplicada, (2) la lectura completa de `docs/SETUP.md`, (3) la plantilla SDD-ADVANCED con trazabilidad y matriz de pruebas por riesgo, que la spec de auth va a necesitar, y (4) contratos de salida y handoff compactos.
- No hace falta añadir capas de gobierno, hooks, reglas por ruta ni skills para cerrar estas brechas. Todas son cambios de texto en archivos que ya existen.

## 2. Matriz: original vs. implementado

Leyenda: **Sí** = implementado · **Parcial** = existe con diferencias relevantes · **No** = no existe.

| v2.1 | Capacidad | Estado | Evidencia actual | Nota |
|---|---|---|---|---|
| §3.1 | Rutas READ-ONLY / BUILD / SDD-LITE / SDD-ADVANCED | Sí | `docs/SETUP.md:223-234`, `orchestrator.md:11-25` | BUILD tiene criterios más concretos que el original: ≤ 3 archivos, un módulo, sin contrato ni rutas nuevas. |
| §3.1 | Precedencia y disparadores de riesgo | Sí | `docs/SETUP.md:232`, `orchestrator.md:13` | Incluye hooks, agentes, settings y `docs/SETUP.md`. |
| §3.1 | Anti-bypass de `Modo: build` | Sí, más fuerte | `docs/SETUP.md:322-323`, `reviewer.md:19` | El control es el archivo real (`guard`), no el texto del prompt. El reviewer cubre lo que se hace por Bash. |
| §3.2 | Decisión de enrutamiento en 5 líneas | Sí | `orchestrator.md:15-23` | |
| §4.1 | L0 núcleo breve | Sí | `CLAUDE.md` 49 líneas, `AGENTS.md` 9 | Dentro del objetivo de 60–120 líneas. |
| §4.1 | L1 reglas por ruta (`.claude/rules/`) | No | Solo existe la regla `ask` en `settings.json` | No aporta valor hasta que exista código de auth (ver §4). |
| §4.1 | L2 skills propias | No | — | Sin caso de uso real. No crear. |
| §4.1 | L3 specs | Sí | `docs/specs/` | |
| §4.1 | L4 decisiones y evidencias | Parcial | `docs/evidence/`, `docs/patches/` | Las decisiones viven en la sección `Decisiones` de cada spec. Es suficiente; no hace falta `docs/decisions/`. |
| §4.2 | Exploración acotada y lectura parcial | No | Los 4 agentes dicen "lee `docs/SETUP.md` completo" (`developer.md:6`, `spec.md:7`, `reviewer.md:7`, `orchestrator.md:7`) | Brecha de tokens principal. |
| §4.3 | READ-ONLY sin subagentes | Sí | `orchestrator.md:25` | |
| §4.3 | BUILD: un developer y revisión puntual | Parcial | `orchestrator.md:27-33`, `developer.md:34-40`, `reviewer.md:24-30` | La revisión no es puntual: developer y reviewer ejecutan cada uno vitest, lint y build completos. |
| §4.3 | SDD: spec → aprobación → developer → reviewer | Sí | `orchestrator.md:35-49` | |
| §4.3 | Brief de transferencia estructurado | Parcial | `orchestrator.md:70-71` | Exige spec, fase o `Modo: build`. No fija archivos vetados, criterios ni pruebas exigidas. |
| §4.4 | Una fase por sesión | Sí | `docs/SETUP.md:277-278`, `orchestrator.md:49` | |
| §4.4 | Handoff breve para la sesión siguiente | No | — | Hoy lo cubren evidencias largas y ad hoc. |
| §4.5 / §6.5 | Salida compacta del orquestador | Parcial | `orchestrator.md:15-23, 49` | Sin formato fijo de cierre. |
| §4.5 / §6.5 | Salida compacta de spec | Sí | `spec.md:35` | |
| §4.5 / §6.5 | Salida del developer con PASS / FAIL / NO EJECUTADO | Parcial | `developer.md:57` | Lista de campos, sin estado por comando. |
| §4.5 / §6.5 | Veredicto del reviewer con `archivo:línea` | Sí | `reviewer.md:34-45` | Sin niveles de severidad más allá de bloqueante, sugerencia y spec; es suficiente. |
| §5.1 | Plantilla SDD-LITE | Sí | `docs/SETUP.md:335-387` | |
| §5.2 | Plantilla canónica SDD-ADVANCED | No | `spec.md:18` (una línea: "añade permisos, contratos…") | El agente spec improvisa la estructura. |
| §5.4 | IDs RN → contrato → AC → prueba → evidencia | Parcial | La spec de workflow usa AC-01… ad hoc | No está en la plantilla. |
| §5.2 | Norma de integridad: evidencias fuera de la spec aprobada | Sí | `docs/evidence/`, casillas permitidas (`docs/SETUP.md:323`) | |
| §6.1 | Orquestador sin código, sin aprobar | Sí | `orchestrator.md:9, 40-46, 72` y `guard` | No tiene Bash: no puede ejecutar `git status`. Lo compensa el reviewer. |
| §6.3 | Developer: verifica aprobación, no edita specs | Sí | `developer.md:12, 25` y hook por `agent_type` | |
| §6.4 | Reviewer: diff real, sin seguimiento e ignorados | Sí | `reviewer.md:18-19` | |
| §7 | Matriz de pruebas por riesgo (unit / integración / E2E / seguridad / migración) | No | Solo política de unit tests (`docs/SETUP.md:401-427`) | Necesaria para auth y RBAC. |
| §7 | Build una sola vez al final | Parcial | Sí en paralelo (`docs/SETUP.md:284`); no en secuencial | En secuencial se duplica. |
| §8.1 | Aprobación humana, ledger intocable, reaprobar tras cambios | Sí, más fuerte | `docs/SETUP.md:236-273` | Firma SSH externa y autorización de gobierno separada. |
| §8.2 | Casos adversariales y sesión real | Parcial | Evidencia de Fase B: varios NO VERIFICADO (`template-v2-phase-b.md:426-443`) | Pendiente de Fase D. |
| §9 | Fases A y B | Sí | PR #1, #2 y #3 integrados en `main` | |
| §9 | Fases C, D y E | No | `template-v2-professional-workflow.md:165-170` | No iniciadas. |
| §10 | Benchmark A/B | No | — | |
| §11 | Formato de cierre y handoff de fase | No | — | |

## 3. Qué ya funciona: BUILD / ODD-LIGHT

- **Clasificación por plan de archivos, no por texto.** `orchestrator.md:13` revisa los archivos que se tocarían antes de clasificar.
- **Escalada automática.** Si BUILD crece o toca un disparador, se detiene y pasa a SDD (`docs/SETUP.md:234`, `orchestrator.md:33`).
- **Sin spec ni aprobación en BUILD.** El hook exige la línea `Modo: build` para lanzar `developer` sin spec, y esa línea no desbloquea rutas protegidas (`orchestrator.md:71`).
- **El control es determinista.** `guard` actúa sobre Write/Edit/NotebookEdit en cualquier agente y en el hilo principal. El reviewer detecta lo hecho por shell en el diff real (`reviewer.md:19`).
- **Criterio de terminado.** El orquestador pasa al developer qué cambiar, criterio de terminado y archivos esperados (`orchestrator.md:29`).

Conclusión: la **seguridad** de BUILD está resuelta. Lo que falta es su **ligereza**.

## 4. Brechas reales, priorizadas

Solo se incluyen brechas con beneficio medible o que la siguiente fase de trabajo (spec de auth) va a necesitar.

| # | Prioridad | Brecha | Efecto actual | Cambio mínimo |
|---|---|---|---|---|
| G1 | Alta | **Verificación duplicada.** Developer y reviewer ejecutan cada uno `npx vitest run`, `npm run lint` y `npm run build` completos (`developer.md:34-40`, `reviewer.md:24-30`). | Dos builds por ciclo. Cada ciclo de corrección añade dos más. `npx vitest run` también ejecuta los 47 tests del hook (`vitest.config.mts` no los excluye). | El developer verifica solo lo que tocó: tests relacionados y `eslint` sobre sus archivos, como ya hace en modo paralelo. El reviewer ejecuta la verificación completa una sola vez. `npx vitest run .claude/hooks` solo si el diff toca `.claude/hooks/`. |
| G2 | Alta | **Lectura completa de `docs/SETUP.md` en cada agente.** | En BUILD, orquestador + developer + reviewer leen ≈ 3 × 6,6 k tokens ≈ 20 k tokens (estimación) para un cambio de una línea. El developer lee 17 KB de gobierno que el hook ya hace cumplir. | Cada agente lee solo sus secciones. Developer: §1, §2, "Ejecución en paralelo" y "Unit testing". Spec: §1, §2, "Planes alcanzables" y "Plantilla de spec". Orquestador y reviewer: sin cambios (necesitan el gobierno). Sin dividir el archivo. |
| G3 | Alta para auth | **Sin plantilla SDD-ADVANCED ni matriz de pruebas por riesgo.** | La spec de auth (Clerk, usuarios, roles) será la primera SDD-ADVANCED de producto. Sin plantilla, el agente spec improvisa estructura, IDs y pruebas de seguridad. | Un archivo de plantilla con las secciones de `v2.1 §5.2` (solo hasta el nivel requerido), IDs RN/AC y la tabla de `v2.1 §7`. Un puntero de una línea en `spec.md` y en `docs/SETUP.md`. |
| G4 | Media | **Salidas y handoff sin formato fijo.** | Los cierres de fase generan evidencias extensas. Una sesión nueva necesita releer mucho para continuar. El developer no marca qué comandos no ejecutó. | Formato del developer de `v2.1 §6.5` (PASS / FAIL / NO EJECUTADO). Formato de cierre de `v2.1 §11` en el orquestador, en ≤ 10 líneas. |
| G5 | Baja | **Brief de transferencia incompleto.** | El orquestador puede omitir archivos vetados o pruebas exigidas. | Añadir los campos de `v2.1 §4.3` a la regla existente de `orchestrator.md:70-71`. Una sola lista, sin plantilla nueva. |

**Descartadas por ahora (YAGNI):**

- `.claude/rules/*` por ruta: solo aportan cuando existan rutas reales de auth y base de datos. Crearlas en la primera fase de la spec de auth, o después.
- Skills propias, `docs/decisions/`, `docs/architecture/`: sin caso de uso.
- Bash en el orquestador: amplía la superficie de ataque. El reviewer ya inspecciona Git.
- Nuevos hooks o tipos de autorización: el gobierno actual cubre todos los casos de `v2.1 §8`.
- Quitar la duplicación de la regla de aprobación en `CLAUDE.md`, `docs/SETUP.md` y los agentes: es defensiva y cuesta pocas líneas.

## 5. Separación por fases C, D y E

El orden aprobado en `template-v2-professional-workflow.md:165-170` es: spec de auth, luego C, D y E.

### Fase C — Contexto progresivo y spec avanzada

Valor real: G1, G2, G3, G4 y G5. Todo es texto en archivos existentes, más una plantilla nueva.

| Elemento del plan original de C | Recomendación |
|---|---|
| Reducir `CLAUDE.md` | No hace falta: tiene 49 líneas. |
| Lectura parcial de `docs/SETUP.md` | Sí (G2). |
| `docs/templates/spec-advanced.md` | Sí (G3), con la matriz de pruebas por riesgo dentro. |
| `.claude/rules/*` con rutas reales de auth | Diferir hasta que existan esas rutas. |
| Handoff y contratos de salida | Sí (G4, G5). Estaba en D; cabe en C porque es el mismo tipo de cambio. |
| Verificación sin duplicar | Sí (G1). No figuraba en el plan; es el mayor ahorro de tiempo. |

### Fase D — Reviewer, seguridad y tests del sistema de agentes

Valor real: cerrar los NO VERIFICADO que afectan a controles que se van a usar.

| Pendiente | Prioridad | Motivo |
|---|---|---|
| Spec aprobada con `## Archivos sensibles` en sesión real: desbloquea esas rutas y ninguna más | Alta | La spec de auth depende de ello (rutas `auth`, `lib/db*`, `proxy.*`). |
| Hook de la copia del checkout principal en sesiones de escritorio con worktree (`docs/SETUP.md:271`) | Alta | Puede bloquear o aprobar con una versión distinta del hook. |
| `autorizo gobierno` de extremo a extremo en sesión real con la clave del usuario | Media | Probado en repos temporales con claves desechables; nunca en sesión real. Fase C lo necesitará. |
| Mutación y revisión independiente de `fix-1`; mutación de `fix-2b` | Media | Registrados como pendientes en la evidencia. |
| `session_id` en subagentes, reglas `PowerShell(...)`, `::$DATA`, symlinks, mensajes entre sesiones | Baja | Riesgos residuales ya aceptados; `guard` falla cerrado. |

**Recomendación de eficiencia:** no abrir una sesión separada para los dos puntos de prioridad alta. Incluirlos como criterios de aceptación de la primera fase de la spec de auth, que los ejercita de forma natural.

### Fase E — Benchmark

- Reducir a B01 (cambio de metadata y estilo, ruta BUILD), medido antes y después de Fase C. Es donde actúan G1 y G2.
- No crear un B03 sintético: usar la spec de auth real como caso B03 y registrar sus métricas.
- B02 y B04 solo si B01 y B03 no permiten concluir (ya decidido en la spec de workflow).
- Métricas: delegaciones, ciclos reviewer ↔ developer, número de builds, tiempo hasta un resultado verificable y uso real reportado por la versión instalada de Claude Code. Sin porcentajes estimados.

### Fuera de C, D y E

- Portabilidad de aprobaciones y limpieza de datos del entorno antes de reutilizar la plantilla en otro proyecto (`template-v2-phase-b.md:85`). Sigue pendiente; no es parte de esta propuesta.

## 6. Reducción de tokens, agentes, pruebas y tiempo

Estimaciones para un cambio BUILD de un archivo. No son mediciones; Fase E debe confirmarlas.

| Concepto | Hoy | Con la propuesta |
|---|---|---|
| Subagentes | 2 (developer, reviewer) | 2. Se conserva el reviewer: es quien detecta escrituras por shell en rutas protegidas. |
| Lecturas de `docs/SETUP.md` | 3 completas, ≈ 20 k tokens | 2 completas + 1 parcial, ≈ 15 k tokens |
| `npm run build` por ciclo | 2 | 1 |
| `npx vitest run` completo por ciclo | 2, con los 47 tests del hook | 1; tests del hook solo si cambia el hook |
| Ciclo de corrección extra | +2 builds, +2 suites | +1 build, +1 suite |

**Opción no recomendada todavía:** BUILD sin subagentes en el hilo principal para cambios de texto o estilo de un archivo. `guard` también protege el hilo principal, pero sin reviewer nadie revisa el diff real frente a escrituras por shell. Decidir solo con datos de Fase E.

## 7. Qué conservar sin cambios

- Las 4 rutas, sus criterios y los disparadores de riesgo.
- Los 4 agentes y sus responsabilidades. No añadir agentes.
- Todo el gobierno: `spec-approval.mjs` y sus tests, `settings.json` (`deny`, `ask`, hooks, `onFailure: block`), firma SSH, `autorizo gobierno`, ledger y rutas sensibles.
- La aprobación por fase y su invalidación por hash.
- El bucle de corrección con máximo 3 ciclos.
- Las reglas de paralelismo por archivos disjuntos y el build único tras el paralelo.
- La plantilla SDD-LITE y la política de unit tests.
- `CLAUDE.md` y `AGENTS.md` (este último lo regenera `next dev`).

## 8. Propuesta mínima de evolución

Una sola spec futura de Fase C, en **una fase de ≤ 5 tareas**, solo cambios de texto. Requiere `apruebo` y `autorizo gobierno` con sus firmas SSH, como toda modificación de gobierno.

| Tarea | Archivos | Cambio |
|---|---|---|
| T1 | `.claude/agents/developer.md` | G1: verificación focalizada en secuencial, sin build. G2: lectura parcial. G4: salida con PASS / FAIL / NO EJECUTADO. |
| T2 | `.claude/agents/reviewer.md` | G1: verificación completa única. Tests del hook solo si el diff toca `.claude/hooks/`. |
| T3 | `.claude/agents/spec.md`, `docs/templates/spec-advanced.md` (nuevo) | G2: lectura parcial. G3: plantilla ADVANCED con IDs y matriz de pruebas por riesgo, y un puntero a ella. |
| T4 | `.claude/agents/orchestrator.md` | G4: formato de cierre de ≤ 10 líneas. G5: campos del brief. |
| T5 | `docs/SETUP.md` | Ajustar la frase de verificación del developer y añadir un puntero a la plantilla. Sin duplicar contenido. |

Archivos: 6 (5 existentes y 1 nuevo). Sin hooks, sin `settings.json`, sin dependencias, sin cambios en `vitest.config.mts`.

**Decisión pendiente del usuario: orden respecto a la spec de auth.**

- **Opción A (recomendada):** Fase C mínima antes de la spec de auth. La spec de auth usaría la plantilla ADVANCED y sus ciclos costarían un build menos cada uno. Coste: una ronda de aprobación de gobierno antes de empezar con auth.
- **Opción B:** spec de auth primero, como decidió la spec de workflow. El orquestador pasa la estructura de `v2.1 §5.2` en el brief. Fase C se hace después con la experiencia de auth.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Sin build, el developer no detecta errores de tipos; el build es el único chequeo completo de tipos (`CLAUDE.md`). Puede haber más ciclos de corrección. | El reviewer construye siempre. Medir los ciclos en Fase E. Si suben, añadir `npx tsc --noEmit` al developer, más barato que el build. |
| Un developer que no lee el gobierno puede intentar tocar una ruta protegida. | `guard` bloquea igual y `developer.md:18` ordena detenerse. El reviewer revisa el diff. |
| Saltar los tests del hook cuando no cambia el hook podría ocultar una regresión indirecta, por ejemplo una dependencia actualizada. | Ejecutarlos también cuando cambien `package.json` o `package-lock.json`. |
| La plantilla ADVANCED puede inflar specs con secciones vacías. | Mantener la regla "no crear secciones vacías" (`spec.md:18`, `v2.1 §5.1`). |
| Cualquier edición de agentes o de `docs/SETUP.md` es cambio de gobierno. | Seguir el flujo existente: spec en borrador, `apruebo`, `autorizo gobierno` y firmas SSH. Esta propuesta no autoriza nada. |
| Las cifras de tokens de este documento son estimaciones. | Fase E mide con el contador real de la herramienta. |

## 10. Criterios de éxito

Para una futura Fase C basada en esta propuesta:

- Un cambio BUILD de un archivo ejecuta **un** `npm run build` por ciclo, no dos.
- El developer en BUILD no lee la §3 de gobierno de `docs/SETUP.md` y el hook sigue bloqueando las rutas protegidas.
- `npx vitest run .claude/hooks` corre solo cuando el diff toca `.claude/hooks/`, `package.json` o `package-lock.json`.
- La spec de auth se redacta con la plantilla ADVANCED: cada regla crítica tiene RN → contrato → AC → prueba, e incluye al menos un caso negativo de permisos por control.
- Cada cierre de fase cabe en ≤ 10 líneas y basta para continuar en una sesión nueva.
- `npx vitest run .claude/hooks` pasa sin cambiar aserciones. No cambian hooks, `settings.json`, firmas ni ledger.
- Fase E registra con datos reales el antes y el después de B01, sin porcentajes inventados.

## 11. Fuera de alcance de este documento

No se modificó `.claude/`, `CLAUDE.md`, `AGENTS.md` ni `docs/SETUP.md`. No se tocaron hooks, firmas, aprobaciones, Clerk, Neon ni MADRE. No se crearon specs. No se iniciaron las Fases C, D ni E. No hubo commit, push ni PR.
