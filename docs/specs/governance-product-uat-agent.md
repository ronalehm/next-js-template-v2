# Agente `product` para UAT funcional

- Módulo: governance
- Estado: aprobado
- Fase actual: Fase 1
- Ruta: SDD-ADVANCED (disparador: agentes y hooks, `docs/SETUP.md` §3)
- Sustituye parcialmente: `docs/specs/template-v2-uat-workflow.md`, solo en los puntos de la sección «Relación con la spec histórica». La spec firmada no se edita.

## Objetivo

El ambiente **DEV Beta es compartido y tiene usuarios reales**. Ninguna funcionalidad con impacto funcional para esos usuarios debe habilitarse sin la aceptación previa de Producto. Esta spec **no define un proceso de liberación a producción**.

Hoy Producto depende de que el `orchestrator` lo guíe en cada prueba. Esta spec crea un agente dedicado de solo lectura, `product`, que Producto ejecuta como agente principal (`claude --agent product`). Una persona de Producto ejecuta UAT de forma sencilla, guiada, documentada y con el mínimo de tokens. El agente verifica la identificación y el gate de inicio, guía las pruebas con una card compacta, registra resultados y observaciones en su sesión, y prepara paquetes de evidencias. Además se documenta, como obligación operativa, el **gate de liberación a DEV Beta** (RN-13).

Usa el formato de `docs/forms/uat.md` y las reglas de «UAT y cambios solicitados» de `docs/SETUP.md` §3. Las cita sin copiarlas ni flexibilizarlas. No crea un sistema de pruebas nuevo ni duplica el gobierno existente.

Fuera de alcance: frontend UAT, base de datos nueva, entornos nuevos, integraciones o publicación automática en GitHub/Linear, automatización de despliegues, agentes o roles nuevos, sistemas de aprobación adicionales y la automatización técnica del gate DEV Beta (si se requiere, una spec independiente).

## Relación con la spec histórica

`docs/specs/template-v2-uat-workflow.md` sigue firmada y vigente. Esta spec la sustituye o precisa solo en estos puntos:

| Punto de la spec histórica | Qué dice | Qué cambia |
|---|---|---|
| RN-04 / D-UAT-3 (fila Frontend/Backend) y AC-06 | «sin agentes ni hooks nuevos» | Se agregan el agente `product` y su control en el hook. El trabajo escalado sigue por SDD. |
| D-UAT-3 (fila Orchestrator) y «6. UAT guiado» | El `orchestrator` guía un caso por vez y registra las observaciones | La guía, el gate de inicio y el registro de resultados pasan al agente principal `product`. El `orchestrator` coordina el traspaso y conserva la clasificación real de ruta, asignaciones, autorizaciones y revalidación. |
| D-UAT-3 (matriz de 5 roles) | Cinco filas de responsabilidad UAT | `docs/SETUP.md` la reemplaza por **3 roles** (Producto, Developers, DevOps / Integrador) y una nota: `orchestrator`, `developer`, `reviewer` y `product` son herramientas, no roles. El `reviewer` sigue siendo control técnico obligatorio. |
| D-UAT-7 «Gobierno intacto» | Hooks y tests del hook sin cambios | **Excepción limitada:** solo se agregan a `.claude/hooks/spec-approval.mjs` y `.claude/hooks/spec-approval.test.mjs` el control y las pruebas de `agent_type === "product"` (T1). El resto de D-UAT-7 sigue vigente. |
| D-UAT-11 (regla de merge) | El merge procede tras requisitos técnicos, autorizaciones y aceptación funcional | **Se extiende, no se reemplaza:** el merge no constituye por sí mismo autorización de liberación. La exposición a usuarios de DEV Beta exige además el gate de liberación, verificado en el momento que fija RN-13. |
| D-UAT-12 («UAT no aplicable») | Declarable para cambios solo de documentación, agentes, gobierno o herramientas sin impacto funcional visible | **Se restringe** (RN-15): no es usable cuando cambian permisos de la aplicación, autenticación, autorización, reglas de negocio o comportamiento funcional visible por usuarios. «Permisos de la aplicación» no incluye los permisos de agentes o hooks de gobierno, así que un cambio solo de gobierno como esta spec puede seguir declarándolo. |
| D-UAT-14 (Linear/GitHub) | Colaboración por PR y reparto Linear/GitHub | **Compatible, con criterios de destino precisos** (RN-11). |

Sin cambios: D-UAT-6 (un `developer` escribe el registro en checkpoints); D-UAT-11 «Quién crea qué» y D-UAT-15 (ningún agente hace commits, push ni PR; solo el humano autorizado); D-UAT-13 (el «colaborador de código» es una capacidad humana de Producto, fuera del agente); D-UAT-7 (la aceptación UAT no equivale a `apruebo` ni a `autorizo gobierno`).

## Alcance y reglas

Incluye:
- Un agente nuevo, `.claude/agents/product.md`, de **solo lectura** (`tools: Read, Glob, Grep`), ejecutado **únicamente como agente principal**.
- El traspaso desde el `orchestrator` (§6): brief, sesión `product`, paquete de vuelta, y como paso final «DevOps libera a DEV Beta tras el gate» (cita SETUP; el merge no equivale a liberar). **No** se agrega `product` a la allow-list `Agent(...)`.
- Un control en el hook para `agent_type === "product"` (escritura, comandos y escalamiento) con pruebas negativas.
- Documentación de gobierno: en `docs/SETUP.md`, tabla de agentes, matriz de 3 roles, criticidad P0–P3 frente a complejidad, mapeo de estados, destino GitHub/Linear y backlog compartido sin duplicados, el bloque «Gate de liberación a DEV Beta» (11 condiciones, listadas una sola vez ahí), el flujo de 9 pasos, la restricción de «UAT no aplicable» y las reglas de seguridad de DEV Beta; en `CLAUDE.md`, la tabla de agentes. `product.md` y `orchestrator.md` las citan sin copiarlas.

No incluye:
- `product` como subagente, escritura de archivos (el registro lo escribe un `developer` autorizado en `Modo: build`), corrección de código, ramas, commits, PR o merge.
- Cambios en `IMPLEMENTS_NOTHING`, `.claude/settings.json`, el formato o estados de `docs/forms/uat.md`, ni la capacidad «colaborador de código».
- Migraciones, cambios de infraestructura, habilitación automática por merge, conectores o publicación automática en GitHub/Linear.

### Reglas de negocio

- **RN-01 (card UAT-LIGHT, un caso por interacción).** `product` guía **una prueba por interacción** con una card compacta en Markdown, presentación de la ficha de 10 campos de `docs/forms/uat.md` §1. Cada caso de prueba usa el ID `UAT-01`, `UAT-02`, etc.; las observaciones usan `<INICIATIVA>-ADJ-nn` (RN-04). Los identificadores oficiales no cambian. Se basa en rutas, pantallas y textos verificados en el código del commit en prueba. No inventa botones, rutas ni comportamientos.
  - **Visible:** ID y título; **Developer** · rol y **Validador** · rol; «DÓNDE PROBAR» con la URL (protocolo, puerto y ruta tomados del entorno verificado del brief, destacada y copiable; no supone HTTPS; verificada en el código una vez por funcionalidad y versión; si falta un dato, pide solo ese); objetivo en una frase; tabla `Paso | Validar | Esperado`; resultados PASS, NO PASS, PASS CON OBSERVACIONES, NO EJECUTADO / No pude probar (la card nunca ofrece BLOQUEADO; ver RN-03).
  - **Una línea, solo si exigen acción de Producto:** campos 3, 4 y 9. **Interno:** campo 10. Los 10 campos se completan siempre y van en el paquete.
  - Una sola pregunta para registrar el resultado; acepta texto o números. Foco de la interacción: **Dónde probar → Qué validar → Qué ocurrió → Qué sigue.**
- **RN-02 (gate de inicio de ronda).** Antes de la primera prueba, valida las 6 condiciones del «Gate de inicio de ronda» (SETUP, `docs/forms/uat.md` §5; sin cambios) contra las evidencias del brief: PR, rama, commit exacto, veredicto del reviewer técnico y entorno preparado. Sin evidencia no da por cumplida una condición.
  - Si falta, es insuficiente o es inconsistente (p. ej. commits distintos entre brief, PR y entorno), informa la condición afectada y **no inicia** la ronda.
  - Una ronda sin PR solo se acepta con «alcance: preliminar» expreso: provisional, sin aceptación definitiva ni habilitación de merge.
  - Este gate es **distinto** del gate de liberación (RN-13): no lo sustituye ni lo cumple.
- **RN-03 (resultados, versión y estados).** Registra cada resultado en su sesión con la versión probada: commit exacto (UAT con PR; un PASS sin commit no es válido) o identificador «provisional» (preliminar, sin PASS definitivo). No concede PASS por resultados automatizados ni por afirmaciones genéricas, y no sobrescribe un FAIL o BLOQUEADO posterior sin aclaración registrada.
  - Con varios pasos registra el resultado de cada uno y luego el general. Todo paso es **obligatorio** salvo que el brief lo marque como opcional. Precedencia del resultado general:
    1. Algún paso obligatorio, u opcional ejecutado, NO PASS → **NO PASS**.
    2. Si no, algún paso obligatorio BLOQUEADO → **BLOQUEADO**.
    3. Si no, algún paso obligatorio NO EJECUTADO → **NO EJECUTADO**.
    4. Si no, algún paso PASS CON OBSERVACIONES → **PASS CON OBSERVACIONES**.
    5. Si no (todos los pasos obligatorios PASS) → **PASS**.
  - Un paso obligatorio NO EJECUTADO o BLOQUEADO **nunca** produce PASS ni PASS CON OBSERVACIONES general, aunque el resto de los pasos haya pasado. Un paso opcional no ejecutado no cambia el general, pero se informa. Si un paso opcional se ejecuta, su resultado participa en la evaluación con la misma precedencia: un NO PASS opcional da NO PASS general y nunca queda oculto bajo un PASS general.
  - Mapeo a estados oficiales de `docs/forms/uat.md` (sin cambios):

    | Resultado mostrado | Estado interno |
    |---|---|
    | PASS | PASS |
    | NO PASS | FAIL |
    | PASS CON OBSERVACIONES | PASS CON OBSERVACIÓN |
    | NO EJECUTADO / No pude probar | BLOQUEADO si un defecto, dependencia o el entorno lo impide; NO EJECUTADO si no se intentó (tiempo, decisión o alcance) |

  - Para NO EJECUTADO y BLOQUEADO registra el motivo.
  - `BLOQUEADO` es un estado **interno** de la plantilla oficial. Producto siempre elige «NO EJECUTADO / No pude probar» en la card, y el agente decide el estado interno según la causa que Producto describe: BLOQUEADO o NO EJECUTADO. La precedencia de arriba se aplica sobre esos estados internos (AC-25).
- **RN-04 (observación y registro).** Un NO PASS o PASS CON OBSERVACIONES exige una **descripción** de lo ocurrido (qué se esperaba y qué ocurrió); sin ella no se cierra la prueba. La evidencia adicional se pide solo si es necesaria o está disponible. La observación recibe el ID `<INICIATIVA>-ADJ-nn`, queda vinculada a la prueba y a la versión probada y lleva una clasificación **preliminar** (BUG, VISUAL, UX, FUNCTIONAL CHANGE, TECHNICAL-CRITICAL) que no fija la ruta ni autoriza `Modo: build`.
  - **Mapeo de los 13 datos del registro** a los campos existentes de `docs/forms/uat.md` (sin cambiar el formato ni crear un registro paralelo):

    | Dato obligatorio | Campo existente |
    |---|---|
    | ID de la prueba | «Prueba relacionada» / fila de la prueba |
    | Resultado funcional | Fila de la prueba: «Estado de resultado» |
    | Developer y Producto (nombre y rol) | Línea de encabezado de la ronda; «Responsable / asignado» |
    | Descripción de la observación | «Descripción» |
    | Criticidad funcional | «Prioridad» |
    | Complejidad técnica (si está evaluada) | **Metadato separado** en el mismo registro, asociado al ID: línea `Complejidad: <ID> · Baja\|Media\|Alta · evaluada por <nombre> (Developer)` bajo la tabla de observaciones. «Clasificación» conserva solo el tipo (BUG, VISUAL, UX, FUNCTIONAL CHANGE, TECHNICAL-CRITICAL). |
    | Decisión de Producto | «Decisión» |
    | Responsable de corrección | «Responsable / asignado»: `original: <Developer> · corrige: <nombre>` |
    | Referencia a GitHub PR o Linear Issue | «Implementación (PR y/o ticket)» |
    | Versión o commit probado | Fila de la prueba: columna de commit |
    | Estado de seguimiento | «Estado de ciclo de vida» |
    | Revisión y revalidación | «Regresión» y «Aceptación» |
- **RN-05 (decisión y aceptación de Producto).** Las 4 decisiones sobre una observación son **exclusivas de Producto**: incluir en este ciclo, posponer al backlog, rechazar o solicitar reformulación. El agente puede recomendar, nunca decidir, y nunca usa ni sugiere «apruebo». La aceptación funcional UAT es independiente de `apruebo docs/specs/<slug>.md`, `autorizo gobierno docs/specs/<slug>.md`, las firmas SSH y las autorizaciones de integración o despliegue. La **aceptación funcional** es explícita, de Producto, y se refiere a una versión exacta.
- **RN-06 (bloqueos).** Ante FAIL o BLOQUEADO aplica los 5 pasos de «Bloqueos» de `docs/SETUP.md`: registra lo observado, escala de inmediato solo el riesgo crítico, suspende solo los casos dependientes y continúa con los independientes si es seguro.
- **RN-07 (paquete, destino sugerido y traspaso).** Al pausar, cerrar la ronda o preparar un PR, entrega a Producto un **paquete de evidencias** compacto, generado en checkpoints y no tras cada respuesta, con: responsables (nombre y rol; Developer asignado a la corrección si es distinto); PR, commit o versión y entorno probados; **estado del gate**; pruebas ejecutadas; resultados por paso y por caso; observaciones (con los 12 campos); decisiones de Producto; referencias a GitHub o Linear; evidencias; casos pendientes o bloqueados; y, **por observación, el destino sugerido (comentario de PR o Issue de Linear, RN-11) con el contenido listo para copiar**. Si falta algo en la sesión no lo inventa. Antes de cerrar avisa que el contexto se pierde si no se entrega el paquete.
  - **Traspaso manual:** Producto copia el paquete y lo pega en la sesión del `orchestrator`, que comprueba que esté completo (si no, lo devuelve sin registrarlo) y encarga a un `developer` en `Modo: build` volcarlo en `docs/evidence/<slug>-uat.md` en un checkpoint, con los 12 campos y los 7 estados de ciclo de vida de `docs/forms/uat.md` §6.
  - **Paquete completo para traspaso ≠ registro completo para cierre:** Producto entrega los datos que puede conocer durante la validación. Los campos técnicos todavía no evaluados (complejidad, ruta, autorización, implementación, regresión) se marcan `PENDIENTE · <responsable>`: Developer para complejidad e implementación, `orchestrator` para ruta y autorización, `reviewer` para regresión. El `orchestrator` no rechaza el paquete por campos que corresponden a fases posteriores. Solo lo devuelve si falta un dato que Producto o `product` debían aportar en la validación: responsables, versión, resultados por paso y caso, descripción de observaciones o decisiones de Producto. Esto no permite liberar con controles obligatorios pendientes: el gate DEV Beta (RN-13) exige el registro completo para cierre.
  - **Paquete completo con publicación pendiente:** un paquete es funcionalmente completo aunque alguna referencia externa esté en `PUBLICACIÓN PENDIENTE`; ese estado no lo hace incompleto. El `developer` lo registra en el checkpoint con «Implementación (PR y/o ticket)» = `PUBLICACIÓN PENDIENTE` y completa el enlace en un checkpoint posterior, cuando el publicador responsable informa la referencia. `PUBLICACIÓN PENDIENTE` no equivale a observación publicada ni cumple por sí solo la condición 6 del gate DEV Beta (RN-13).
  - Producto decide el destino; la persona o proceso autorizado publica (RN-10) y la referencia vuelve al registro en el checkpoint.
- **RN-08 (identificación obligatoria).** Cada ronda, card y paquete identifica: nombre completo y rol del **Developer responsable de la entrega**; nombre completo y rol de la persona de **Producto** que valida; **Developer asignado a la corrección, si es distinto**; y **PR, commit o versión**. El `orchestrator` los entrega en el brief. `product` los verifica antes de empezar, no inventa nombres, roles ni asignaciones, y si falta un dato pide solo ese y mantiene la ronda pendiente. Ante una reasignación conserva al Developer original y registra quién corrige.
- **RN-09 (criticidad, complejidad y tratamiento).** Son conceptos separados y ninguno fija la ruta BUILD o SDD: el `orchestrator` aplica los controles del gobierno vigente.
  - **Criticidad funcional** (la decide **Producto**; el agente asiste): P0 crítica (seguridad, permisos, pérdida de datos o integridad); P1 alta (impide un flujo esencial); P2 media (problema funcional secundario o UX relevante); P3 baja (detalle visual o mejora menor). Va en «Prioridad».
  - **Complejidad técnica** (Baja, Media, Alta): la evalúa **Desarrollo**; `product` no la estima ni analiza archivos. Va como metadato separado asociado al ID de la observación (RN-04), nunca dentro de «Clasificación».
  - **Tratamiento:** un P0 se escala de inmediato, detiene las pruebas dependientes inseguras y **bloquea la exposición de la funcionalidad afectada a usuarios beta** hasta resolverse. Los defectos bloqueantes de flujos esenciales (P1 bloqueante) también se resuelven antes de habilitar la funcionalidad. Los pendientes no bloqueantes pueden posponerse solo con autorización expresa de Producto, documentados y asignados. Un PASS CON OBSERVACIONES no obliga a corregirlo todo antes de continuar.
- **RN-10 (solo lectura y separación entre validación y publicación).** `product` no escribe archivos, no ejecuta comandos, no lanza agentes ni sesiones, no crea ramas, commits, push, PR, merges ni despliegues, no **crea ni modifica Issues o PR en GitHub o Linear**, no autoriza correcciones y no amplía sus permisos. Valida y prepara contenido; **publica una persona o proceso expresamente autorizado**. Conectores y publicación automática quedan fuera de esta fase. Si una tarea lo requiere, lo informa y deriva al `orchestrator`.
- **RN-11 (backlog compartido, destino de observaciones y registro obligatorio).** El backlog UAT es **único desde el punto de vista operativo**: sus registros viven en los PR de GitHub y en Linear, y Producto y Developers pueden consultarlos para conocer el estado y seguir la resolución. No es un sistema nuevo: el acceso de ambos roles a GitHub y Linear es un requisito organizativo que esta spec no configura.
  - **Tablero de Linear:** el backlog compartido en Linear es un proyecto que ya existe; no se crea otro. Hoy es `https://linear.app/mentec/project/dms-intelligent-2e5b1df6456f/overview`. El brief indica el enlace del proyecto en cada iniciativa. `product.md`, `orchestrator.md` y SETUP lo citan como «el proyecto de Linear indicado en el brief», sin fijar la URL, para que la plantilla siga siendo genérica.
  - **Acceso comprobado antes del uso operativo:** que el tablero exista no prueba que cada persona tenga acceso. Antes de la primera ronda que use el backlog, se verifica **con las cuentas reales** de Producto y de los Developers de la iniciativa que pueden consultar los PR y los Issues relacionados. El brief lo declara: sí o no, quién lo comprobó y cuándo. No se presumen permisos que no se comprobaron. Si no está confirmado, `product` lo informa: las pruebas pueden ejecutarse, pero las observaciones quedan en el paquete como `PUBLICACIÓN PENDIENTE` y no se dan por registradas en el backlog, aunque sí se documentan en `docs/evidence/<slug>-uat.md` (RN-07).
  - **Publicador responsable:** el brief lo identifica por nombre y rol, sin crear roles nuevos.
    - En **GitHub** publica el Developer humano asignado o un DevOps / Integrador autorizado.
    - En **Linear** publica Producto o la persona autorizada para administrar el backlog.
    - Si falta el publicador, `product` pide solo ese dato y no lo inventa. Cada observación se publica según su naturaleza, y `docs/evidence/<slug>-uat.md` se conserva **siempre, para toda prueba y observación y cualquiera sea el destino**.
  - **Antes de registrar, se busca un registro relacionado (sin duplicados).** El brief incluye los PR, Issues o tickets relacionados que ya se conocen. `product` contrasta cada observación con esas referencias y con las de la ronda, y sugiere «continuar» en lugar de «crear» cuando corresponda. Como `product` no accede a GitHub ni a Linear, el responsable autorizado de publicar verifica en ellos que no exista un registro relacionado antes de publicar.
  - **Orden de destino:** (1) si corresponde al PR actual, comentario en el mismo hilo del PR; (2) si corresponde a un ticket de Linear existente, se actualiza ese ticket y se sigue allí; (3) solo si la observación es independiente y no hay registro relacionado, se crea un Issue nuevo en Linear.
  - **Datos que conserva cada observación,** en su destino y en el registro: ID UAT, descripción, responsables, estado, evidencia, decisión de Producto, criticidad (P0–P3, Producto), complejidad (Baja/Media/Alta, Developers, cuando esté evaluada) y enlace al PR o ticket.
  - **Sin duplicar información:** la discusión y el seguimiento viven en el PR o en Linear. `docs/evidence/<slug>-uat.md` guarda los 12 campos de `docs/forms/uat.md` con el enlace en «Implementación (PR y/o ticket)», no una copia del hilo.

  | Destino | Cuándo | Contenido requerido |
  |---|---|---|
  | **Comentario en el PR** | Defecto de la funcionalidad en validación; corrección dentro del PR vigente; ajuste visual o funcional dentro del alcance ya aprobado. No se crea un Issue por cada observación menor que se resuelva y siga en el PR. | ID UAT, descripción, resultado esperado, resultado observado, criticidad y Developer responsable |
  | **Ticket de Linear existente (actualizar)** | La observación corresponde a un ticket que ya existe. Se actualiza y se sigue allí; no se crea un ticket duplicado. | ID UAT, descripción, criticidad, decisión de Producto y enlace a la evidencia |
  | **Issue nuevo en Linear** | Solo si es independiente y no hay registro relacionado: mejora planificada para otro ciclo; bug que no se corrige en el PR actual; funcionalidad nueva o cambio fuera del alcance aprobado; requiere planificación, priorización o seguimiento separado | Responsable, prioridad, descripción, referencia de la prueba y enlace a la evidencia |
- **RN-12 (asignación, cierre y revalidación).** Una observación no se considera corregida porque el Developer lo declare: exige implementación autorizada, evidencia técnica, revisión del `reviewer` y revalidación funcional de Producto cuando aplique. Ante un commit nuevo se evalúa el impacto y se revalidan los casos afectados; un PASS previo se conserva solo con justificación documentada. Los pendientes pospuestos conservan su **ID, su referencia en Linear y la decisión de Producto**.
  - **Pospuestos con seguimiento posterior al PR:** toda observación pospuesta que deba seguirse después del PR queda vinculada a un **ticket activo** de Linear: se reutiliza el existente relacionado siempre que sea posible y solo si no hay ninguno se crea uno nuevo (RN-11). Si el ticket relacionado está cerrado, el publicador lo reabre o crea uno nuevo enlazado al anterior, sin duplicar la conversación. Conserva el ID UAT y los enlaces cruzados: el ticket enlaza la evidencia y el hilo del PR de origen, el hilo del PR enlaza el ticket y el registro guarda el enlace al ticket en «Implementación (PR y/o ticket)». No se duplican tickets ni conversaciones: la discusión sigue en el ticket.
  - Al cerrar la ronda, el `orchestrator` y el Developer evalúan las observaciones en lotes compatibles. Por cada corrección aceptada registran: Developer asignado («Responsable / asignado»), criticidad («Prioridad»), complejidad (metadato asociado al ID, RN-04), ruta verificada y autorización («Autorización»), decisión («Decisión»), ticket o PR («Implementación»), estado («Estado de ciclo de vida») y pruebas a repetir («Regresión»). No se asigna automáticamente al Developer que entregó si se designó formalmente a otro.
  - Flujo: Producto reporta → `product` documenta → Orchestrator clasifica y coordina → Developer corrige → Reviewer verifica → Producto revalida → DevOps integra.
- **RN-13 (gate de liberación a DEV Beta).** Obligación operativa **separada** del gate de inicio de ronda (RN-02), verificada por **DevOps / Integrador** antes de exponer una funcionalidad con impacto funcional a usuarios reales de DEV Beta. Regla de liberación: «No habilitar una funcionalidad con impacto funcional para usuarios reales de DEV Beta sin aceptación previa de Producto.»
  - **Fuente normativa:** esta spec fija el texto exacto que T4 copia en `docs/SETUP.md`. Desde la implementación, SETUP es la fuente normativa; `product.md` y `orchestrator.md` la citan sin copiarla.
  - **Flujo de 9 pasos:**
    1. **Developer implementa** en una rama o worktree independiente, respetando el alcance y las autorizaciones SDD.
    2. **Reviewer verifica:** pruebas técnicas y revisión de los cambios.
    3. **Producto ejecuta UAT** sobre la versión candidata, en un entorno controlado con cuentas y datos de prueba aislados.
    4. **Se documentan las observaciones:** `product` prepara los resultados y las incidencias.
    5. **Se registran las incidencias** en el PR de GitHub o en Linear según RN-11, conservando el registro formal UAT.
    6. **Developers corrigen** solo los ajustes autorizados, por la ruta que corresponda.
    7. **Reviewer verifica nuevamente** las correcciones y las pruebas de regresión.
    8. **Producto revalida y acepta** que los criterios funcionales se cumplen en la versión evaluada.
    9. **DevOps libera a DEV Beta** tras verificar el gate, las autorizaciones vigentes y la correspondencia entre la versión aceptada y la que se habilita.
  - **11 condiciones obligatorias** (las verifica DevOps / Integrador):
    1. Funcionalidad implementada y revisada técnicamente.
    2. Developer y validador de Producto identificados.
    3. Entorno de UAT controlado y separado de los datos reales de usuarios beta.
    4. Versión candidata identificada.
    5. Pruebas UAT obligatorias ejecutadas y documentadas.
    6. Observaciones registradas, clasificadas y vinculadas a GitHub o Linear según corresponda.
    7. Sin defectos críticos o bloqueantes pendientes de la funcionalidad que se liberará.
    8. Correcciones relevantes revisadas técnicamente y revalidadas funcionalmente.
    9. Aceptación funcional explícita de Producto.
    10. La versión a liberar corresponde a la validada, o tiene evaluación de impacto y las revalidaciones pertinentes.
    11. Integración y despliegue autorizados conforme al gobierno vigente.
  - **Responsabilidades:** DevOps / Integrador verifica el gate; Producto acepta funcionalmente.
  - **Regla definitiva sobre merge y momento de verificación:** «El merge no constituye por sí mismo autorización de liberación. Si provoca una exposición automática a usuarios beta, DevOps verifica el gate antes del merge; si la exposición es independiente, antes de desplegar o habilitar.» Esta spec no implementa ni modifica CI/CD.
  - `product` **no verifica ni autoriza la liberación**: su paquete solo declara la aceptación funcional (sí/no, para qué versión exacta) y lista los pendientes bloqueantes (P0 y defectos bloqueantes de flujos esenciales).
  - **El merge no equivale a autorización para desplegar o habilitar** la funcionalidad a usuarios beta. DevOps verifica además que la versión a liberar corresponde a la aceptada; si cambió el código, evalúa el impacto y revalida lo afectado.
  - La aceptación UAT no sustituye las aprobaciones SDD, las firmas SSH ni las autorizaciones de integración o despliegue.
- **RN-14 (seguridad de DEV Beta).** DEV Beta no es un entorno desechable.
  - No se ejecutan UAT destructivas sobre datos reales de usuarios beta; se usan cuentas y datos de prueba **aislados**; no se cambian permisos ni información de usuarios reales sin autorización específica; no se usan funcionalidades no aprobadas con usuarios reales.
  - Esta spec no ejecuta migraciones ni cambios de infraestructura; un merge no constituye por sí mismo autorización de liberación y, si expone automáticamente, exige el gate antes del merge (RN-13); la aprobación técnica no equivale a la aceptación funcional.
  - **Minimización de datos en evidencias** (paquete, comentarios de PR, tickets y registro):
    - nunca incluyen secretos: contraseñas, tokens, claves, cookies o URLs con credenciales;
    - no incluyen datos personales de usuarios reales de DEV Beta; si una evidencia los muestra, se enmascaran o anonimizan (por ejemplo `u***@dominio`, «usuario beta A») o se recorta la captura;
    - se registra solo lo necesario para reproducir la observación;
    - `product` nunca pide a Producto que pegue credenciales y, si las recibe, no las repite y pide retirarlas de la evidencia;
    - los nombres y roles de Developer, validador y responsable de publicación son datos de trabajo requeridos y no se anonimizan.
  - Encaje con la condición 4 del gate de inicio («cuentas y bases aisladas de producción»): un DEV Beta con usuarios reales cuenta como entorno real, no desechable, para esa condición.
  - Si el aislamiento es insuficiente, `product` **detiene la ronda sin improvisar**, registra BLOQUEADO y pide la preparación del entorno al responsable técnico.
- **RN-15 («UAT no aplicable»).** Se conserva para cambios sin impacto funcional observable (documentación, gobierno interno), con justificación registrada y las verificaciones técnicas obligatorias. **No puede usarse** cuando cambian permisos de la aplicación, autenticación, autorización, reglas de negocio o comportamientos funcionales que afectan a usuarios; ante duda el gate es obligatorio. Los permisos de agentes y hooks de gobierno no son «permisos de la aplicación».
- **RN-16 (UAT-LIGHT y límites para Producto).** UAT-LIGHT es el comportamiento por defecto: mensajes cortos y en español; una card por prueba; objetivo en una frase; contexto técnico y datos del PR no se repiten en cada respuesta (la bienvenida es breve: PR y título, Developer, Producto, cantidad de pruebas y pregunta de empezar); sin análisis de código por interacción; verificación única por funcionalidad y versión; solo se pregunta lo que falta; observaciones solo cuando corresponden y agrupadas al cerrar; paquete solo en checkpoints; solo se escalan riesgos críticos, de seguridad o integridad. No se pide a Producto comandos, Git, logs, hooks ni rutas SDD, y no se reducen las pruebas de seguridad, integridad, aislamiento ni permisos.

## Actores y responsabilidades

Hay solo **tres roles organizacionales**. Los agentes son herramientas internas de Claude Code, no roles. «Developer» es la persona que entrega y corrige; el agente `developer` es la herramienta que escribe el registro en `Modo: build`.

| Rol | Responsabilidad |
|---|---|
| Producto | Ejecutar UAT, registrar observaciones, definir criticidad funcional, decidir su tratamiento y aceptar o rechazar la funcionalidad |
| Developers | Implementar funcionalidades, evaluar la complejidad técnica, realizar correcciones autorizadas y apoyar el registro de evidencias |
| DevOps / Integrador | Coordinar PR, integración y liberación autorizada a DEV Beta, verificando los controles previos (RN-13) |

| Actor | Tipo | Lee el repo | Escribe archivos | Lanza agentes | Aprueba / autoriza |
|---|---|---|---|---|---|
| Producto | Rol humano | — | No durante la prueba | — | Acepta o rechaza funcionalmente; decide observaciones |
| Developers | Rol humano | — | Fuera de la sesión UAT, bajo el gobierno de desarrollo | — | Nunca |
| DevOps / Integrador | Rol humano | — | Fuera de la sesión UAT | — | Integración y liberación autorizadas, según gobierno |
| `product` | Agente principal (herramienta) | Sí (Read/Glob/Grep) | **No** (frontmatter + hook) | **No** | Nunca |
| `orchestrator` | Agente (herramienta) | Sí | Solo las casillas de specs | `spec, developer, reviewer` (sin cambios) | Nunca |
| agente `developer` | Agente (herramienta) | Sí | Según su modo; escribe el registro UAT en `Modo: build` | No | Nunca |
| `reviewer` | Agente (herramienta) | Sí | Según su definición vigente | No | Control técnico; no es aprobación funcional |
| Propietario | Humano | — | — | — | `apruebo` / `autorizo gobierno` + firmas SSH |

## Diseño y dependencias

- **`.claude/agents/product.md`**: frontmatter `name: product`, `tools: Read, Glob, Grep` y `description` (validador funcional UAT, agente principal, solo lectura, no diagnostica ni corrige). Cuerpo: cita RN-01 a RN-16 y remite a `docs/SETUP.md` §3 y `docs/forms/uat.md` en lugar de copiarlos; incluye la bienvenida breve.
- **`.claude/agents/orchestrator.md`**: frontmatter sin cambios (`Agent(spec, developer, reviewer)`). En §6 los pasos de guía se reemplazan por el **traspaso**: determinar si la UAT es obligatoria o «UAT no aplicable» (RN-15); entregar el brief (contrato de entrada) con la instrucción `claude --agent product`; recibir y comprobar el paquete; encargar el registro a un `developer`; evaluar observaciones (RN-12); y como **paso final «DevOps libera a DEV Beta tras el gate»**, citando SETUP sin copiar las condiciones y declarando que el merge no equivale a liberar. No invoca a `product`.
- **`.claude/hooks/spec-approval.mjs`**
  - `guard()`: si `agent_type === "product"`, bloquea `Write|Edit|MultiEdit|NotebookEdit` sobre cualquier ruta.
  - `relay()`: si `agent_type === "product"`, bloquea las herramientas que ya despacha su matcher: ejecución (`Bash`, `PowerShell`, `mcp__terminal__.*`) y escalamiento (`Agent`, `SendMessage`, `CronCreate`, `RemoteTrigger`, `mcp__scheduled-tasks__.*`, `mcp__ccd_session_mgmt__send_message`, `mcp__ccd_session__start_session`, `mcp__ccd_session__hand_off_to_session`). `gh` por Bash ya queda bloqueado por `relay`.
  - Mensajes específicos de `product` (solo lectura; el registro lo escribe un `developer` en `Modo: build`), verificados en AC-09c. Es defensa en profundidad; no depende de la confianza de carpeta.
  - **No se agregan matchers.** Las herramientas MCP de publicación (p. ej. GitHub o Linear) no están en el matcher de `relay`; la protección frente a ellas es el frontmatter (`tools: Read, Glob, Grep`), verificado en AC-09a (ver «Fallos» y Riesgos).
  - **`IMPLEMENTS_NOTHING` no cambia:** solo afecta a `gate()` (lanzamientos `Agent`) y `product` no se lanza como subagente.
- **`.claude/settings.json`**: **no se modifica** (los matchers ya cubren lo bloqueable; `deny` ya incluye `Bash(claude *)` y `PowerShell(claude *)`). Solo cambiaría ante necesidad demostrada y nueva aprobación.
- **`docs/SETUP.md` y `CLAUDE.md`**: lo listado en «Alcance». SETUP es la fuente única de las reglas; no se duplican en `product.md` ni en `orchestrator.md`.
- Se conservan autorizaciones, firmas SSH, `onFailure: block` y restricciones de los demás agentes.

## Contratos y datos

- **Entrada (brief):** identificador e iniciativa UAT; Developer responsable (nombre completo, rol, PR o versión), Developer asignado a la corrección si es distinto, validador de Producto (nombre completo, rol); PR, rama y commit exacto cuando corresponda; revisión técnica; entorno y URL verificados; alcance y casos de prueba; evidencias del gate de inicio; PR, Issues o tickets relacionados ya conocidos (para evitar duplicados, RN-11); **publicador responsable** en GitHub (Developer humano asignado o DevOps / Integrador autorizado) y en Linear (Producto o persona autorizada para administrar el backlog), con nombre completo y rol; **proyecto de Linear del backlog** (enlace; hoy el tablero DMS Intelligent, RN-11); **acceso al backlog verificado con cuentas reales** (sí/no, quién y cuándo lo comprobó; RN-11); pasos opcionales, si los hay (RN-03). Si falta un dato, `product` pide solo ese.
- **Salida (solo en el chat):** bienvenida breve; card por caso (RN-01); resultados por paso y general con estado interno (RN-03); observaciones con ID, criticidad propuesta, clasificación preliminar y destino sugerido con contenido (RN-04, RN-09, RN-11); paquete RN-07.
- **Entrada de vuelta (manual):** Producto pega el paquete en la sesión del `orchestrator`. La referencia a GitHub o Linear se agrega al registro en el checkpoint.
- No toca archivos ni contratos: los registros usan los campos existentes de `docs/forms/uat.md` (RN-04, RN-12).

## Fallos, seguridad y recuperación

- **Escritura, comandos o escalamiento:** el frontmatter no da esas herramientas y el hook las bloquea por `agent_type` (fail-closed). Las ediciones de `.claude/settings*.json` las bloquean `guard()` y el `ask` vigente.
- **Aprobación desde el agente:** `relay` ya bloquea el comando literal; además `product` no sugiere el texto de aprobación ni decide por Producto (RN-05).
- **Publicación en GitHub/Linear por herramientas MCP:** no cubierta por el hook. Se previene por frontmatter y se verifica en AC-09a que ninguna herramienta de publicación GitHub/Linear/MCP esté disponible en la sesión real. **Riesgo residual:** la defensa en profundidad del hook no alcanza a herramientas MCP fuera del matcher; no se agregan matchers en esta fase.
- **Identificación o URL incompletas, o descripción faltante:** pide solo el dato y mantiene la ronda o la prueba pendiente (RN-08, RN-01, RN-04). No inventa.
- **Riesgo P0 / bloqueante:** se escala y se detienen las pruebas dependientes inseguras (RN-09, RN-06); la funcionalidad no se expone a usuarios beta (RN-13).
- **Aislamiento insuficiente en DEV Beta:** se detiene la ronda, BLOQUEADO y solicitud de preparación al responsable técnico (RN-14).
- **Versión liberada distinta de la aceptada:** responsabilidad de DevOps (RN-13): evaluar impacto y revalidar antes de habilitar.
- **Pérdida de contexto:** los resultados no entregados se pierden al cerrar la sesión; RN-07 obliga a avisar y entregar el paquete.
- **Supuesto a verificar:** que en `claude --agent product` el frontmatter limite las herramientas del hilo principal y que el hook reciba `agent_type: "product"`. Se verifica por separado: herramientas en AC-09a, identidad en AC-09b, bloqueos en AC-09c. Nunca se amplían herramientas ni permisos de `product`. Si una verificación falla, la fase se cierra BLOQUEADO y se consulta al propietario.
- **Hook roto:** `onFailure: block` sigue vigente. **Rollback:** revertir el commit de la fase y volver a firmar si corresponde.

## Criterios de aceptación

Verificación manual guiada, salvo que se indique. Los AC remiten a las RN sin repetirlas.

- [ ] AC-01 (RN-02): Dado `claude --agent product`, cuando el brief no trae PR ni commit identificable o trae evidencias inconsistentes, entonces informa qué condición del gate de inicio falla y no presenta la primera card. Excepción: «alcance: preliminar» declarado, con resultados «provisional», ningún PASS definitivo y sin habilitar merge.
- [ ] AC-02 (RN-01): Dado un gate cumplido, cuando guía una prueba, entonces presenta **una sola** card con los elementos visibles de RN-01 (incluidos Developer · rol y Validador · rol, URL y los 4 resultados), campos 3, 4 y 9 solo si exigen acción, campo 10 oculto, una sola pregunta de resultado, y no avanza hasta cerrar el caso.
- [x] AC-03: Dado `agent_type: "product"`, cuando intenta `Write`, `Edit`, `MultiEdit` o `NotebookEdit` sobre `README.md`, `docs/evidence/x-uat.md` o `docs/specs/x.md`, entonces `guard` sale con código 2.
- [x] AC-04: Dado `agent_type: "product"`, cuando intenta `Bash`, `PowerShell` o `mcp__terminal__*` con un comando inocuo (`ls`), entonces `relay` sale con código 2.
- [x] AC-05: Dado `agent_type: "product"`, cuando intenta escalar permisos, entonces el hook sale con código 2 en cada caso:
  - `Edit` de `.claude/settings.json`, `.claude/settings.local.json` o `.claude/agents/product.md`;
  - `Bash` con `claude --dangerously-skip-permissions`;
  - `Agent` con `subagent_type: developer`;
  - `SendMessage`, `CronCreate`, `RemoteTrigger` o `mcp__scheduled-tasks__*`;
  - `mcp__ccd_session_mgmt__send_message`, `mcp__ccd_session__start_session` y `mcp__ccd_session__hand_off_to_session`.
- [x] AC-06: Regresión. Se conservan los resultados vigentes de `developer`, `orchestrator` y `agent_type` undefined en `guard`, `relay` y `gate`. `IMPLEMENTS_NOTHING` y `.claude/settings.json` no aparecen en el diff.
- [ ] AC-07 (RN-04, RN-05, RN-06): Dada una observación, cuando el agente la registra, entonces le asigna ID `<INICIATIVA>-ADJ-nn` y clasificación preliminar, y ofrece solo las 4 decisiones de RN-05, sin «apruebo». Ante un FAIL, suspende solo las pruebas cuyo «Depende de» la nombra.
- [ ] AC-08 (RN-07): Dado un checkpoint, cuando se pausa o cierra la ronda, entonces el agente entrega el paquete RN-07 completo (incluye estado del gate, resultados por paso y caso, referencias GitHub/Linear y destino sugerido con contenido por observación) y no escribe ningún archivo. `orchestrator.md` §6 describe el traspaso manual y la comprobación de integridad antes de delegar a un `developer`.
- [ ] AC-09a (herramientas no disponibles): Dada una sesión real `claude --agent product` con el `product.md` entregado sin modificar, cuando se le pide crear un archivo, ejecutar `ls`, lanzar otro agente y crear una Issue o PR en GitHub o Linear, entonces solo dispone de `Read`, `Glob` y `Grep`: **no hay ninguna herramienta de escritura, terminal, delegación ni de publicación GitHub/Linear/MCP**, y `git status` no cambia. La evidencia muestra la respuesta del agente y la lista de herramientas disponibles.
- [ ] AC-09b (identidad en el hilo principal): Dado un clon descartable fuera del repositorio, con el `product.md` entregado sin modificar y un hook diagnóstico temporal de solo lectura, cuando Producto ejecuta `claude --agent product` y el agente hace un `Read`, entonces la entrada del hook muestra `agent_type: "product"`. El hook diagnóstico: es un `PreToolUse` limitado a `Read|Glob|Grep`; solo anota `agent_type` en un archivo temporal fuera del clon; sale siempre con 0; no amplía herramientas ni permisos. Ni el hook ni la configuración del clon se commitean ni tocan los 6 archivos de esta spec ni el `.claude/settings.json` del repositorio. Clon y archivo temporal se eliminan al terminar.
- [x] AC-09c (bloqueo del hook, automatizado): Dado `spec-approval.test.mjs`, cuando se ejecuta `npx vitest run .claude/hooks`, entonces las pruebas negativas de AC-03, AC-04 y AC-05 comprueban para `agent_type: "product"` que `guard()` y `relay()` salen con código 2 y el mensaje específico de `product`.
- [x] AC-10: Dados `orchestrator.md`, `docs/SETUP.md` y `CLAUDE.md`, entonces:
  - el frontmatter del `orchestrator` sigue siendo `Agent(spec, developer, reviewer)`;
  - §6 describe el traspaso (brief con RN-08, paquete, registro por `developer`), la evaluación de observaciones (RN-12) y el paso final «DevOps libera a DEV Beta tras el gate», que cita SETUP sin copiar las condiciones y declara que el merge no equivale a liberar;
  - SETUP tiene los 3 roles con la nota de agentes como herramientas, la criticidad P0–P3 frente a la complejidad, el mapeo de estados, los criterios de destino GitHub/Linear (RN-11), el bloque «Gate de liberación a DEV Beta» (11 condiciones, una sola vez) con el flujo de 9 pasos, la restricción de «UAT no aplicable» (RN-15) y las reglas de seguridad de DEV Beta (RN-14), y ya no dice «Sin agentes ni hooks nuevos»;
  - las tablas de agentes de SETUP y `CLAUDE.md` listan `product` como agente principal de solo lectura.
- [x] AC-11: `npx vitest run .claude/hooks` pasa sin modificar las aserciones previas de `spec-approval.test.mjs`.
- [ ] AC-12 (identificación, RN-08): Dado un brief sin Developer o validador (nombre completo, rol, PR, commit o versión), cuando `product` lo recibe, entonces pide únicamente el dato faltante, no inventa nombres, roles ni asignaciones y mantiene la ronda pendiente. Con todo completo, card y paquete muestran nombre y rol de ambos y la versión; ante una reasignación conservan al Developer original y agregan quién corrige. Si el brief no nombra a la persona autorizada para publicar o no declara el acceso al backlog verificado, `product` pide solo ese dato. Sin acceso confirmado, las observaciones quedan como «publicación pendiente» y no se presentan como registradas en el backlog (RN-11).
- [ ] AC-25 (precedencia del resultado general, negativo, RN-03): Dado un caso con pasos obligatorios, cuando los resultados por paso son:
  - (a) PASS, PASS CON OBSERVACIONES y NO EJECUTADO, entonces el general es NO EJECUTADO;
  - (b) PASS, PASS y BLOQUEADO, entonces el general es BLOQUEADO;
  - (c) PASS CON OBSERVACIONES y BLOQUEADO, entonces el general es BLOQUEADO;
  - (d) NO PASS y BLOQUEADO, entonces el general es NO PASS (FAIL).
  En ningún caso el general es PASS ni PASS CON OBSERVACIONES. Con un paso opcional no ejecutado y el resto PASS, el general es PASS y el paso se informa. (e) Con pasos obligatorios PASS y un paso opcional ejecutado con NO PASS, el general es NO PASS (FAIL), nunca PASS.
- [ ] AC-13 (URL y resultado por paso, RN-01, RN-03): Dado un caso, cuando se presenta, entonces la URL mantiene protocolo, puerto y ruta del entorno del brief (HTTP si es HTTP) y la ruta se verificó una vez por funcionalidad y versión; si falta o no existe, pide solo ese dato. Con varios pasos, registra cada resultado y calcula el general con la precedencia de RN-03 (casos negativos en AC-25), aplica el mapeo a estado interno y registra el motivo de NO EJECUTADO o BLOQUEADO. La card ofrece «NO EJECUTADO / No pude probar» y nunca BLOQUEADO. Ante esa respuesta, el agente pregunta la causa y la mapea: si Producto dice que el entorno no carga, el estado interno es BLOQUEADO; si dice que no tuvo tiempo, es NO EJECUTADO.
- [ ] AC-14 (seguridad de DEV Beta, RN-14): Dado DEV Beta, cuando se prepara o ejecuta una ronda, entonces solo se usan cuentas y datos de prueba aislados, no se ejecutan pruebas destructivas ni cambios sobre usuarios reales, y no se usan funcionalidades no aprobadas con usuarios reales. Si el aislamiento es insuficiente, `product` detiene la ronda, registra BLOQUEADO y pide la preparación al responsable técnico sin improvisar. Una cuenta o base de usuarios reales no satisface la condición 4 del gate de inicio. Si Producto aporta una evidencia con una contraseña, un token o datos personales de un usuario real, el agente no repite el dato, pide enmascararlo o retirarlo, y el paquete no contiene secretos ni datos personales sin enmascarar (minimización de RN-14).
- [ ] AC-15 (registro y destino de observaciones, RN-04, RN-11): Dado un NO PASS o PASS CON OBSERVACIONES, cuando Producto no aporta descripción, entonces no se cierra la prueba y el agente pregunta «¿Qué observaste?». Con descripción, registra la observación con los datos de RN-04 mapeados a campos existentes de `docs/forms/uat.md`. Propone el destino según el orden de RN-11 (hilo del PR actual, ticket de Linear existente o Issue nuevo solo si es independiente y no hay registro relacionado) con su contenido requerido, no crea un Issue por observación menor resoluble en el PR y deja claro que `docs/evidence/<slug>-uat.md` se conserva siempre.
- [x] AC-16 (gate de liberación a DEV Beta, RN-13): Dados SETUP y `orchestrator.md`, entonces SETUP lista **una sola vez**, con el texto de RN-13, las 11 condiciones y el flujo de 9 pasos (cada condición y cada paso de RN-13 aparece en SETUP sin omisiones ni agregados), distingue este gate del gate de inicio de ronda, asigna la verificación a DevOps / Integrador y contiene la regla de liberación literal y la regla definitiva de RN-13 sobre el merge, también literal: el gate se verifica antes del merge si este expone automáticamente a usuarios beta, o antes de desplegar o habilitar si la exposición es independiente. No hay cambios de CI/CD en el diff; el paquete de `product` declara solo la aceptación (sí/no y versión exacta) y los pendientes bloqueantes, sin verificar ni autorizar la liberación; y SETUP y `orchestrator.md` dicen que el merge no constituye por sí mismo autorización de liberación, sin afirmar que nunca expone cambios. Ningún archivo presenta la aceptación UAT como autorización de despliegue ni la automatización como parte de esta spec.
- [ ] AC-17 (criticidad, complejidad y asignación, RN-09, RN-12): Dada una observación, entonces la criticidad P0–P3 la decide Producto (el agente asiste) y la complejidad Baja/Media/Alta la evalúa Desarrollo, nunca `product`; ninguna fija la ruta BUILD o SDD. Un P0 bloquea la exposición a usuarios beta hasta resolverse; los defectos bloqueantes de flujos esenciales se resuelven antes de habilitar; los pendientes no bloqueantes solo se posponen con autorización expresa de Producto, documentados y asignados. Cada corrección aceptada tiene los datos de asignación de RN-12 en campos existentes. Criticidad, tipo y complejidad son atributos distintos: «Prioridad» solo contiene P0–P3, «Clasificación» solo contiene BUG, VISUAL, UX, FUNCTIONAL CHANGE o TECHNICAL-CRITICAL, y la complejidad aparece solo en la línea de metadato `Complejidad: <ID> · …` asociada al ID. `docs/forms/uat.md` no aparece en el diff.
- [ ] AC-18 (decisión y aceptación de Producto, RN-05): Dada una observación o la funcionalidad, entonces el agente ofrece las 4 decisiones, puede recomendar pero no decide, no usa «apruebo» y no equipara la aceptación UAT con `apruebo docs/specs/<slug>.md`, `autorizo gobierno`, firmas SSH ni autorizaciones de integración o despliegue. La aceptación funcional es explícita y nombra la versión exacta.
- [ ] AC-19 (integridad de la documentación UAT, RN-07, RN-11): Dado un paquete, cuando el `orchestrator` lo valida, entonces comprueba que esté completo **para traspaso** (RN-07). Solo lo devuelve si falta un dato propio de la validación. Si trae campos técnicos marcados `PENDIENTE · <responsable>`, lo acepta y los registra así. Mientras algún control obligatorio siga pendiente, el registro no es completo para cierre y el gate DEV Beta no se da por cumplido. Una referencia externa en `PUBLICACIÓN PENDIENTE` no hace incompleto al paquete: no lo devuelve por eso. El `developer` lo registra con ese valor en «Implementación (PR y/o ticket)» y completa el enlace en un checkpoint posterior. Mientras quede pendiente, la observación no figura como publicada y la condición 6 del gate DEV Beta no se da por cumplida. Si está completo, encarga a un `developer` en `Modo: build` registrar en `docs/evidence/<slug>-uat.md` respetando los 12 campos y los 7 estados de `docs/forms/uat.md` §6, con los 13 datos de RN-04 mapeados y sin registro paralelo; la referencia GitHub/Linear se agrega en el checkpoint. `product` no escribe ningún archivo.
- [ ] AC-20 (revalidación y cierre, RN-12): Dada una observación en corrección, cuando el Developer declara que está resuelta, entonces no se da por corregida hasta tener implementación autorizada, evidencia técnica, revisión del `reviewer` y, cuando aplique, revalidación de Producto. Ante un commit nuevo se evalúa el impacto y se revalidan los casos afectados. Los pospuestos conservan ID, referencia Linear y decisión de Producto. Una observación pospuesta con seguimiento posterior al PR queda vinculada a un ticket activo: reutiliza el ticket relacionado existente y solo crea uno nuevo si no hay ninguno. Conserva el ID UAT y los enlaces cruzados (ticket ↔ hilo del PR ↔ registro), sin tickets ni conversaciones duplicados.
- [ ] AC-21 (UAT-LIGHT, RN-16): Dada una ronda normal, cuando `product` interactúa con Producto, entonces cumple RN-16 y el foco Dónde probar → Qué validar → Qué ocurrió → Qué sigue: mensajes cortos, una pregunta por resultado, sin análisis técnico salvo petición ni tareas técnicas para Producto, y bienvenida breve sin repetir el PR.
- [x] AC-22 («UAT no aplicable», RN-15): Dados SETUP y `orchestrator.md`, entonces la excepción exige justificación registrada y las verificaciones técnicas, y **no puede declararse** si cambian permisos de la aplicación, autenticación, autorización, reglas de negocio o comportamiento funcional visible por usuarios (ante duda, obligatorio). Para esta spec (solo gobierno e instrucciones de agentes, sin permisos de la aplicación ni reglas de negocio) la declaración es consistente, y SETUP aclara que los permisos de agentes y hooks no son «permisos de la aplicación».
- [ ] AC-23 (validación vs publicación, RN-10, RN-11): Dado `product`, cuando se pide crear o modificar una Issue o PR en GitHub o Linear, entonces el agente declina, entrega el destino sugerido y el contenido listo para copiar, y deriva la publicación a la persona o proceso autorizado. Producto decide el destino y la referencia vuelve al registro en el checkpoint. No hay conectores ni publicación automática.
- [ ] AC-24 (backlog compartido sin duplicados, RN-11): Dado un brief con un PR actual y un ticket de Linear relacionado ya conocido, cuando Producto reporta una observación de cada tipo, entonces:
  - `product` sugiere continuar en el hilo del PR para la primera y actualizar el ticket existente para la segunda, sin proponer un Issue nuevo;
  - solo propone un Issue nuevo para una observación independiente sin registro relacionado;
  - cada observación conserva ID UAT, descripción, responsables, estado, evidencia, decisión de Producto, criticidad, complejidad (si está evaluada) y enlace;
  - SETUP declara el backlog operativo único en GitHub y Linear, visible para Producto y Developers, y que el responsable autorizado verifica en ellos que no haya duplicados antes de publicar;
  - el registro guarda el enlace, no una copia del hilo.

Seguridad y regresión del agente (instrucción 10): AC-03, AC-04, AC-05, AC-06, AC-09a, AC-09b, AC-09c y AC-11.

## Trazabilidad

| Requisito / decisión | AC | Archivo |
|---|---|---|
| D1: solo agente principal, sin subagente | AC-09a, AC-09b, AC-10 | `product.md`, `orchestrator.md` |
| D2: solo lectura Read/Glob/Grep (RN-10) | AC-03, AC-04, AC-05, AC-09a, AC-09c | `product.md`, `spec-approval.mjs`, `spec-approval.test.mjs` |
| D3: guía, gate de inicio, registro por versión y paquete (RN-01 a RN-03, RN-06, RN-07, RN-16) | AC-01, AC-02, AC-08, AC-13, AC-21 | `product.md`, `orchestrator.md` |
| D4: registro escrito por un `developer`, traspaso manual | AC-08, AC-10, AC-19 | `product.md`, `orchestrator.md`, `SETUP.md` |
| D5: sin código, ramas, commits, PR ni merge | AC-04, AC-05, AC-23 | `spec-approval.mjs`, `product.md` |
| D6: colaborador de código fuera de alcance | AC-10 | `SETUP.md` |
| D7: Producto ejecuta y acepta; no sustituye SDD (RN-05) | AC-07, AC-18 | `product.md`, `SETUP.md` |
| Instrucción 1: registro y destino de observaciones (RN-04, RN-11) | AC-15, AC-07, AC-10 | `product.md`, `SETUP.md` |
| Instrucción 2: integridad de la documentación UAT (RN-07, RN-11) | AC-19, AC-08, AC-15 | `product.md`, `orchestrator.md` |
| Instrucción 3: identificación de responsables (RN-08), responsable de publicar y acceso al backlog (RN-11) | AC-12, AC-10, AC-24 | `product.md`, `orchestrator.md`, `SETUP.md` |
| Precedencia del resultado general (RN-03, OBS-01) | AC-25, AC-13 | `product.md`, `SETUP.md` |
| Minimización de datos personales y secretos (RN-14) | AC-14, AC-19 | `product.md`, `SETUP.md` |
| Instrucción 4: card UAT-LIGHT (RN-01, RN-03, RN-16) | AC-02, AC-13, AC-21 | `product.md` |
| Instrucción 5: criticidad y complejidad (RN-09, RN-12; complejidad como metadato por ID, RN-04) | AC-17, AC-20, AC-10 | `product.md`, `SETUP.md`, `orchestrator.md` |
| Instrucción 6: aceptación funcional de Producto (RN-05) | AC-18, AC-16 | `product.md`, `SETUP.md` |
| Instrucción 7: gate de liberación a DEV Beta (11 condiciones y 9 pasos en RN-13) y seguridad de DEV Beta (RN-13, RN-14) | AC-16, AC-14, AC-10 | `SETUP.md`, `orchestrator.md`, `product.md` |
| Instrucción 8: «UAT no aplicable» con excepción justificada (RN-15) | AC-22 | `SETUP.md`, `orchestrator.md` |
| Backlog compartido sin duplicados (RN-11) | AC-24, AC-15 | `product.md`, `orchestrator.md`, `SETUP.md` |
| Instrucción 9: validación vs publicación en GitHub/Linear (RN-10, RN-11) | AC-23, AC-09a | `product.md`, `SETUP.md` |
| Instrucción 10: seguridad del agente y regresión de hooks (RN-10) | AC-03, AC-04, AC-05, AC-06, AC-09a, AC-09b, AC-09c, AC-11 | `spec-approval.mjs`, `spec-approval.test.mjs`, `product.md` |
| Sustitución y precisión de la spec histórica (D-UAT-3, D-UAT-7, D-UAT-11, D-UAT-12, D-UAT-14), 3 roles | AC-06, AC-10, AC-16, AC-22 | `SETUP.md`, `orchestrator.md`, `spec-approval.mjs`, `spec-approval.test.mjs` |
| `IMPLEMENTS_NOTHING` y `settings.json` sin cambios | AC-06 | `spec-approval.mjs` |

## Matriz de pruebas

| Caso | Tipo | Dónde |
|---|---|---|
| `product` bloqueado en Write/Edit/MultiEdit/NotebookEdit (3 rutas) | Unit negativa (hook) | `.claude/hooks/spec-approval.test.mjs` |
| `product` bloqueado en Bash/PowerShell/`mcp__terminal__*` | Unit negativa (hook) | idem |
| `product` bloqueado al escalar: settings, agents, `claude --dangerously-skip-permissions`, Agent, SendMessage, CronCreate, RemoteTrigger, scheduled-tasks y gestión de sesiones | Unit negativa (hook) | idem |
| Regresión de `developer`, `orchestrator` y undefined (AC-06, AC-11) | Unit (tests existentes, sin cambios) | idem |
| AC-09c agrupa AC-03 a AC-05: código 2 y mensaje de `product` | Automatizada | `npx vitest run .claude/hooks` |
| AC-01, AC-02, AC-07, AC-08, AC-12, AC-13, AC-15, AC-21 (gate de inicio, card, resultados, observación, paquete, identificación, URL) | Manual guiado (sesión `claude --agent product` con una iniciativa de prueba y casos con datos faltantes, entorno HTTP y ruta inexistente) | Evidencia en el PR |
| AC-24 (backlog sin duplicados) — **obligatoria en la DoD** | Manual guiado (brief con un PR y un ticket de Linear relacionados, y tres observaciones: del PR, del ticket e independiente) | Evidencia en el PR |
| AC-14 (aislamiento DEV Beta: caso de entorno sin aislamiento → BLOQUEADO; evidencia con token o dato personal → no se repite y se pide enmascarar) | Manual guiado | Evidencia en el PR |
| AC-25 (precedencia, negativo: cuatro combinaciones de pasos (a)–(d), un paso opcional no ejecutado y (e) un paso opcional ejecutado con NO PASS → NO PASS general) — **obligatoria en la DoD**; incluye AC-13: «NO EJECUTADO / No pude probar» con la causa «el entorno no carga» → BLOQUEADO, y con «no tuve tiempo» → NO EJECUTADO | Manual guiado (una card de prueba por combinación) | Evidencia en el PR |
| AC-17, AC-18, AC-20 (criticidad, complejidad, decisión, cierre) | Manual guiado más revisión de `orchestrator.md` §6 | Evidencia en el PR |
| AC-19 (registro formal e integridad; paquete con complejidad y ruta en `PENDIENTE · <responsable>` → se acepta y el gate no se da por cumplido; paquete sin resultados por paso → se devuelve; paquete con una referencia en `PUBLICACIÓN PENDIENTE` → se registra y el enlace se completa después; la condición 6 del gate no se da por cumplida) | Manual guiado más revisión de `orchestrator.md` §6 | Evidencia en el PR |
| AC-23 (el agente declina publicar y entrega destino y contenido) | Manual guiado | Evidencia en el PR |
| AC-10, AC-16, AC-22 (SETUP, `orchestrator.md`, `CLAUDE.md`: gate DEV Beta y momento de su verificación antes del merge, del despliegue o de la activación, «UAT no aplicable», roles, tablas) | Revisión de documentos (diff, búsqueda de que las 11 condiciones aparezcan una sola vez y comparación con el texto de RN-13) | Evidencia en el PR |
| AC-09a: sin herramientas de escritura, terminal, delegación ni publicación GitHub/Linear/MCP | Manual (sesión real, `product.md` sin modificar) | Evidencia en el PR |
| AC-09b: identidad `agent_type: "product"` en el hilo principal | Manual (entorno aislado con hook diagnóstico temporal de solo lectura) | Evidencia en el PR |

## Archivos sensibles

(ninguno)

## Cambios de gobierno

- `.claude/agents/product.md`
- `.claude/agents/orchestrator.md`
- `.claude/hooks/spec-approval.mjs`
- `.claude/hooks/spec-approval.test.mjs`
- `docs/SETUP.md`
- `CLAUDE.md`

## Plan de tareas

### Fase 1
- [x] T1 — Hook: control `agent_type === "product"` en `guard()` y `relay()` (escritura, comandos y escalamiento), con pruebas negativas primero (RED), sin matchers nuevos y sin tocar `IMPLEMENTS_NOTHING` · archivos: `.claude/hooks/spec-approval.mjs`, `.claude/hooks/spec-approval.test.mjs` · depende de: — · secuencial (base)
- [x] T2 — Crear el agente principal `product` (solo lectura; RN-01 a RN-16: card, identificación, resultados, observaciones y destino sugerido, criticidad, decisiones, paquete con estado del gate, seguridad de DEV Beta y UAT-LIGHT; sin publicar en GitHub/Linear) · archivos: `.claude/agents/product.md` · depende de: T1 · paralelo con T3
- [x] T3 — `orchestrator` §6: brief con identificación y URL, traspaso a `claude --agent product`, recepción del paquete, registro por un `developer`, evaluación de observaciones (RN-12) y paso final «DevOps libera a DEV Beta tras el gate» (cita SETUP; merge ≠ liberar); frontmatter sin cambios · archivos: `.claude/agents/orchestrator.md` · depende de: T1 · paralelo con T2
- [x] T4 — Documentación de gobierno: SETUP «UAT y cambios solicitados» (3 roles y nota de agentes, criticidad frente a complejidad, mapeo de estados, destino GitHub/Linear y backlog compartido sin duplicados, bloque «Gate de liberación a DEV Beta» con 11 condiciones y flujo de 9 pasos, restricción de «UAT no aplicable», seguridad de DEV Beta) y `product` en las tablas de agentes de SETUP y `CLAUDE.md` · archivos: `docs/SETUP.md`, `CLAUDE.md` · depende de: T2, T3 · secuencial

## Riesgos

- **Guards (seguridad).** Cambia `guard()` y `relay()`. Mitigación: control aditivo limitado a `agent_type === "product"`, pruebas negativas y regresión sin cambiar aserciones (AC-03 a AC-06, AC-09c, AC-11).
- **Contrato compartido.** Cambian la matriz UAT (5 a 3 roles), §6 del `orchestrator` y la regla de «UAT no aplicable». Mitigación: sustitución declarada y acotada; el `reviewer` sigue como control técnico; la spec histórica no se edita.
- **Supuesto `agent_type` en el hilo principal.** Se verifica en AC-09a, AC-09b y AC-09c. El hook diagnóstico solo existe en el clon descartable y no debe aparecer en el diff (AC-06).
- **Exposición en DEV Beta sin aceptación.** Un merge o despliegue puede habilitar una funcionalidad a usuarios reales sin aceptación de Producto. Mitigación: gate de liberación operativo (RN-13, AC-16) y merge ≠ liberación. **Residual:** el gate no está automatizado; depende de DevOps / Integrador (spec independiente si se requiere).
- **Versión aceptada distinta de la liberada.** Mitigación: DevOps verifica la correspondencia o evalúa impacto y revalida (RN-13); el paquete nombra la versión exacta (RN-05).
- **Datos de usuarios reales durante la UAT.** Mitigación: RN-14 y AC-14 (cuentas aisladas, BLOQUEADO si no hay aislamiento). **Residual:** `product` no puede comprobar el aislamiento por sí mismo; depende de la evidencia del brief.
- **Destino equivocado GitHub/Linear.** Mitigación: criterios de RN-11, destino sugerido por `product`, decisión de Producto y registro obligatorio en `docs/evidence/` (AC-15, AC-23).
- **Tickets duplicados o registros relacionados no detectados.** `product` solo conoce las referencias del brief y de la ronda. Mitigación: el brief incluye las referencias conocidas y el responsable autorizado verifica en GitHub y Linear antes de publicar (RN-11, AC-24). Residual: si el brief está incompleto, la detección depende de esa verificación humana.
- **Visibilidad del backlog.** Si Producto o Developers no tienen acceso a GitHub o Linear, el backlog deja de ser compartido. Es un requisito organizativo fuera de esta spec; se registra como pregunta abierta.
- **Herramientas MCP de publicación (residual).** No están en el matcher de `relay` y `settings.json` no cambia. La protección es el frontmatter (verificado en AC-09a); el hook no las cubre como defensa en profundidad. `gh` por Bash sí está bloqueado.
- **Evidencias del gate incorrectas, brief sin nombres o URL incorrecta.** `product` no puede comprobar PR, entorno ni identidades. Mitigación: RN-02 y RN-08 bloquean y piden solo el dato faltante.
- **Paquete pegado incompleto o alterado; pérdida del registro en sesión.** Mitigación: integridad por el `orchestrator` antes de delegar (RN-07, AC-19) y checkpoints.
- **Confusión entre Developer (rol humano) y agente `developer`.** Mitigación: sección «Actores y responsabilidades» y nota en SETUP.
- **Criticidad o complejidad mal asignadas; cierre prematuro.** Mitigación: RN-09 y RN-12 (AC-17, AC-20).
- **PASS general con pasos sin ejecutar.** Mitigación: precedencia de RN-03 y casos negativos de AC-25.
- **Secretos o datos personales en evidencias publicadas.** Mitigación: minimización de RN-14 (AC-14). Residual: lo publicado en GitHub o Linear depende de la revisión de la persona que publica.
- **Divergencia entre el texto de RN-13 y SETUP.** Mitigación: AC-16 exige que SETUP contenga el texto de RN-13; después de implementar, la fuente normativa es SETUP.
- **Campos de `docs/forms/uat.md` sin columnas explícitas** para responsables y complejidad: se usan campos existentes (RN-04), con menor legibilidad.

## Preguntas abiertas

Observaciones pendientes para el propietario o Producto (no bloquean el borrador):

Ninguna. Decisiones cerradas por Producto:

1. **Identificadores:** `UAT-01` (y sucesivos) para casos de prueba; `<INICIATIVA>-ADJ-nn` para observaciones (RN-01, RN-04).
2. **Registro:** `docs/forms/uat.md` no cambia; responsables y complejidad usan los campos existentes y el metadato por ID (RN-04).
3. **Automatización:** fuera de alcance; no hay conectores, pantallas ni automatizaciones de GitHub, Linear o despliegue. Una spec independiente puede evaluarla, junto con la cobertura de herramientas MCP en el hook.
4. **Publicador:** en GitHub, el Developer humano asignado o un DevOps / Integrador autorizado; en Linear, Producto o la persona autorizada para administrar el backlog. Lo nombra el brief (RN-11).
5. **Visibilidad:** se verifica con cuentas reales antes de operar el backlog (RN-11).

## Definition of Done

- AC-01 a AC-25 cumplidos (incluidos AC-09a, AC-09b y AC-09c), con APROBADO del reviewer y evidencia por AC.
- `npx vitest run .claude/hooks`, `npm run lint` y `npm run build` en verde.
- El gate del PR se declara «UAT no aplicable» con justificación: el cambio es solo de gobierno e instrucciones de agentes (RN-14 de `governance-sdd-reliability.md`), sin cambiar permisos de la aplicación, autenticación, autorización ni reglas de negocio, y consistente con la restricción de RN-15. La validación manual de AC-01, AC-02, AC-07, AC-08, AC-09a, AC-09b, AC-12 a AC-21, AC-23, **AC-24** (backlog sin duplicados) y **AC-25** (precedencia de resultados, casos negativos) es obligatoria y se documenta como evidencia técnica en el PR, con una evidencia por AC según la matriz de pruebas. AC-09c y AC-11 se cubren con `npx vitest run .claude/hooks`. AC-10, AC-16 y AC-22 se verifican con la revisión del diff.
