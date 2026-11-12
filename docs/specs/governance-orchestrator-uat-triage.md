# Orchestrator: triage de observaciones de Producto

- Módulo: governance
- Estado: aprobado
- ID: SPEC-governance-orchestrator-uat-triage
- Riesgo: medio (cambia el cuerpo de las instrucciones de un agente; no toca frontmatter, hooks, settings, firmas ni aprobaciones; D7 "Instrucciones de agentes" de `docs/specs/template-v2-odd-sdd-optimization.md`)
- Ruta: SDD-ADVANCED (disparador: agentes)
- Fase actual: 1

## Objetivo

Que el Orchestrator procese observaciones de Producto (texto libre o paquete UAT, aunque incompleto) con trazabilidad verificable, sin burocracia, sin más tokens y sin duplicar reglas de `docs/SETUP.md`.

## Alcance y reglas

- Incluye: una subsección breve (≈12-18 líneas) «Triage de observaciones de Producto» en `.claude/agents/orchestrator.md` (§6.1, tras «UAT guiado»), que solo referencia SETUP.
- No incluye:
  - Reglas ya implementadas, citadas por referencia y no repetidas: clasificación segura, vocabulario incluir/posponer/rechazar/reformular, reparto Linear/GitHub y «sin duplicar registros», ficha de 10 campos, registro de 12 campos, checkpoints por `developer` en `Modo: build`, Orchestrator sin escribir archivos, aceptación UAT ≠ autorización (`docs/SETUP.md`, «UAT y cambios solicitados»; `docs/forms/uat.md`).
  - Cambios en `docs/SETUP.md`, `docs/forms/uat.md`, el frontmatter (`name`, `description`, `tools`) u otros archivos.
  - Agentes, hooks, herramientas o dependencias nuevas; una spec por bug ni un PR por observación.
- RN-01: la subsección cubre estos 8 puntos, en lenguaje de procedimiento del agente:
  1. Acepta reporte libre o paquete UAT incompleto; lo no verificable se marca «sin dato», nunca se inventa decisión, ID, ticket, PR ni commit; pide solo lo mínimo que bloquea.
  2. Verifica origen, PR, commit y evidencia disponibles en READ-ONLY, reutilizando la verificación de ronda (SETUP 8.5), sin subagentes por observación.
  3. Busca registros equivalentes (registro UAT, PR, Linear si hay) antes de proponer un ticket nuevo.
  4. Destino: GitHub = corrección dentro del PR existente; Linear = bug pendiente, mejora futura o cambio independiente; ninguno nuevo = rechazada o ya registrada.
  5. Antes de prometer operaciones en Linear verifica que sus herramientas estén realmente presentes en la sesión; si no, informa y entrega una propuesta lista para registro manual.
  6. No crea tickets, no modifica issues ni autoriza código sin orden expresa del propietario: recomienda, el propietario decide.
  7. Trazabilidad observación↔PR↔evidencia↔ticket mediante el campo «implementación» del registro; checkpoints por el procedimiento vigente.
  8. Salida estándar, una línea por observación: `ID | Diagnóstico | Criticidad | Decisión recomendada | Destino | Responsable | Siguiente acción`; las no críticas se agrupan por ronda; solo riesgos críticos, de seguridad o de integridad se escalan de inmediato.
- RN-02: la subsección no repite reglas de SETUP; las cita por título.

## Diseño y dependencias

- Un único archivo: `.claude/agents/orchestrator.md` (existente), solo texto de procedimiento en el cuerpo. Sin rutas `app/`, componentes ni dependencias.
- El frontmatter `tools` permanece intacto; la disponibilidad de Linear se comprueba en la sesión (RN-01.5).

## Criterios de aceptación

- [x] AC-01 (RN-01) Dado `.claude/agents/orchestrator.md` tras el cambio, cuando se lee la subsección nueva, entonces están presentes los 8 puntos de RN-01 (verificable por lectura/Grep de «sin dato», «equivalent», «herramientas», «implementación», `ID | Diagnóstico`).
- [x] AC-02 (RN-02) Dado el texto nuevo, cuando se compara con `docs/SETUP.md`, entonces no reproduce reglas (solo referencias por título) y mide ≈12-18 líneas.
- [x] AC-03 Dado el diff, cuando se inspecciona, entonces el frontmatter de `orchestrator.md` es idéntico y el único archivo modificado es `.claude/agents/orchestrator.md`.
- [x] AC-04 (caso A) Dado un bug hallado en un PR abierto, cuando se aplica el texto nuevo, entonces el destino es GitHub, en ese PR, sin ticket nuevo.
- [x] AC-05 (caso B) Dado una mejora pospuesta tras el merge, cuando se aplica el texto nuevo, entonces el destino es Linear, solo con orden del propietario y tras buscar duplicados.
- [x] AC-06 (caso C) Dado un cambio mayor o riesgo crítico, cuando se aplica el texto nuevo, entonces se escala de inmediato a evaluación de alcance, autorización y ruta SDD (por referencia a SETUP), sin implementar.
- [x] AC-07 (caso D, negativo) Dado un reporte incompleto, cuando se aplica el texto nuevo, entonces los campos faltantes quedan «sin dato» y no se inventa ID, ticket, PR, commit ni decisión.
- [x] AC-08 (negativo) Dado Linear sin herramientas en la sesión, cuando se aplica el texto nuevo, entonces se informa y se entrega una propuesta para registro manual, sin prometer operaciones.

## Trazabilidad

| RN | Contrato | AC | Prueba |
|---|---|---|---|
| RN-01 | `orchestrator.md` §6.1 | AC-01, AC-04 a AC-08 | Lectura del reviewer contra los casos A/B/C/D |
| RN-02 | `orchestrator.md` §6.1 | AC-02, AC-03 | Lectura y diff del reviewer |

## Cambios de gobierno

- `.claude/agents/orchestrator.md`

## Plan de tareas

### Fase 1
- [x] T1 — Añadir la subsección §6.1 «Triage de observaciones de Producto» tras la sección «UAT guiado» · archivos: `.claude/agents/orchestrator.md` · depende de: — · secuencial (base)

Requiere `apruebo docs/specs/governance-orchestrator-uat-triage.md` y `autorizo gobierno docs/specs/governance-orchestrator-uat-triage.md` con sus firmas.

## Definition of Done

AC de la fase con evidencia en el veredicto del reviewer; los casos A/B/C/D resueltos por lectura del texto nuevo; lo no ejecutado figura como NO EJECUTADO con su motivo.
