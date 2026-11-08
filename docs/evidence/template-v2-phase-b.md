# Evidencia de Fase B: controles de gobierno

Registro de cambios propuestos, pruebas y riesgos residuales. Spec: `docs/specs/template-v2-professional-workflow.md`.

**Estado actual: FASE B COMPLETADA — VALIDADA EN MAIN (2026-11-08).** PR #1 y PR #2 integrados en `main` (`80fe2b7`) de `ronalehm/next-js-template-v2`. Aprobación renovada y firmada por el usuario en el checkout `template-v2-pro`, con controles en PASS. Ver "Validación en main y cierre de Fase B". Las líneas de estado siguientes son históricas.

## Validación en main y cierre de Fase B (2026-11-08)

**Estado propuesto: FASE B COMPLETADA — VALIDADA EN MAIN.**

### 1. Integración y versión validada

- Repositorio: `ronalehm/next-js-template-v2` (privado).
- Checkout: `C:\Users\ronal\template-v2-pro`.
- Rama: `main`.
- HEAD: `80fe2b705edb2e1fca1a6c6b6552cdf64a9690f0`.
- PR #1: gobierno y flujo de agentes, integrado.
- PR #2: remediación de dependencias, integrado.
- Árbol de trabajo inicialmente limpio tras la actualización de `main`, antes de renovar la aprobación.

La implementación de Fase B quedó integrada mediante el PR #1. El PR #2 actualizó las dependencias sin modificar los controles de gobierno.

### 2. Validación de controles en main

| Comprobación | Resultado |
|---|---|
| Firma SSH funcional de Fase B | PASS |
| Gate con `Fase: B` | PASS — exit 0 |
| Gate con `Fase: C` | PASS — exit 2 |
| Guard de `CLAUDE.md` | PASS — exit 2 |
| Guard de `docs/specs/approvals.jsonl` | PASS — exit 2 |
| Relay de aprobación mediante herramientas | PASS — exit 2 |
| Tests automatizados de hooks | PASS — 47/47 |
| Instalación con `npm ci --ignore-scripts` | PASS |
| Lint | PASS |
| Build con Next.js 16.4.5 | PASS |

La aprobación funcional se renovó en el checkout principal el 2026-11-08 UTC. Se generaron dos registros de aprobación para la misma spec y una firma SSH nueva, válida para esta carpeta.

No se requirió autorización privilegiada de gobierno, ya que no se editaron archivos de gobierno.

### 3. Conciliación del plan y criterios de aceptación

**Plan de implementación:** 8 de 8 tareas completadas y respaldadas por evidencia.

**Criterios de aceptación:** AC-01 a AC-22 conciliados con pruebas, código y evidencia documentada.

No se identificaron tareas funcionales pendientes de implementación dentro del alcance acordado de Fase B.

Las casillas de aceptación permanecen sin marcar en la spec. Su estado documental no modifica los resultados verificados ni autoriza nuevas implementaciones.

### 4. Limitaciones y riesgos residuales

Se conservan los riesgos y las pruebas clasificadas como NO VERIFICADO en las evidencias anteriores.

En particular:

- Los hooks no proporcionan aislamiento absoluto frente a procesos locales con los mismos permisos del propietario.
- Algunas verificaciones del entorno real de Claude Code no se realizaron.
- No se repitió la prueba de mutación sobre `fix-1`, conforme a la decisión documentada.
- No se considera que una firma válida en este checkout pueda reutilizarse automáticamente en otra carpeta.

Estas limitaciones fueron documentadas y aceptadas dentro de la Definition of Done de Fase B. No deben presentarse como controles exhaustivamente verificados.

### 5. Estado de aprobación y cambios locales

La renovación produjo modificaciones locales en:

- `docs/specs/approvals.jsonl`: dos registros nuevos.
- `docs/specs/template-v2-professional-workflow.md.sig`: firma renovada.
- `docs/specs/template-v2-professional-workflow.md`: diferencia de finales de línea, sin cambio de contenido normalizado.

No se ha autorizado todavía incorporar esos cambios a un commit.

Las referencias históricas a estados anteriores, como «Sin commit» o «Checkout principal sin modificar», se conservan como evidencia del momento en que fueron registradas y no describen el estado final de integración.

### 6. Dictamen

**FASE B COMPLETADA — VALIDADA EN MAIN, con riesgos residuales aceptados.**

La implementación está integrada, las ocho tareas del plan están completadas y los criterios de aceptación cuentan con la evidencia exigida por su alcance.

No se requieren nuevas pruebas ni implementaciones para cerrar Fase B, salvo que aparezca un defecto concreto y reproducible.

La portabilidad de aprobaciones y la limpieza de información específica del entorno se gestionarán de forma independiente antes de reutilizar la plantilla en otro proyecto.

**Fase C:** no iniciada.

**Estado: FASE B COMPLETADA — VALIDACIÓN LOCAL (2026-11-07).** `fix-1` aplicada, R4 y R7 corregidos y probados en sesión real, y aprobación con firma SSH externa del usuario verificada por `gate`. Riesgos aceptados en "Cierre de Fase B". Sin commit. Checkout principal sin modificar.

**Revisión del PR #1 (2026-11-07):** `fix-2` y `fix-2b` aplicadas por el usuario a mano sobre `792bcb2`. Validación local PASS; sin commit.

## Reparación tras la revisión del PR #1: fix-2 y fix-2b (2026-11-07)

Aplicadas a mano por el usuario en el worktree, sobre `792bcb2` sin modificarlo. El agente no editó archivos de gobierno: preparó los parches en una copia aislada y el usuario los aplicó.

| Parche | SHA-256 | Corrige |
|---|---|---|
| `docs/patches/template-v2-phase-b-fix-2.patch` | `b50cf232be82e363136275f6914846eb8d0ef30ac30273b2a30c31233da8acd3` | El comando de firma podía firmar una entrada vacía si `node` fallaba. `relay` y `deny` no detectaban el modo `record` del hook lanzado desde la terminal. |
| `docs/patches/template-v2-phase-b-fix-2b.patch` | `fe883a1d46270bc5bc95d83d2d5f154ebe67205868cb96f0ad1e1a77d427fa53` | Autoautorización de gobierno: `autorizo gobierno` no exigía firma propia. Sustitución de la solicitud firmada por la de otra sesión. Caducidad sin tope. |

### Hallazgos que motivaron la reparación

1. **Firma de entrada vacía (usuario).**
   - Problema: `echo {} | node … | ssh-keygen -Y sign > .sig` firmaba una entrada vacía cuando `node` fallaba, por ejemplo con el alias `winpty` de Git Bash.
   - Corrección: el comando nuevo usa `node.exe` y escribe la declaración en un archivo temporal. Aborta si la salida es distinta de 0 o la declaración está vacía. Muestra la declaración, firma ese archivo y verifica la firma contra `~/.claude/spec-allowed-signers`. Solo entonces reemplaza la `.sig`. Si algo falla, imprime `ERROR: firma no creada`.
2. **Autoautorización (reviewer, BLOQUEANTE, reproducido).**
   - Problema: un agente podía ejecutar `node .claude/hooks/spec-approval.mjs record` con `autorizo gobierno …` desde Bash. Eso creaba una autorización privilegiada válida, y `guard CLAUDE.md` pasaba de exit 2 a 0.
   - Mitigación en fix-2: `relay` y `deny` bloquean ese comando.
   - Corrección de raíz en fix-2b: `autorizo gobierno` solo registra una solicitud. `hasPrivilege` exige además una firma SSH del usuario en `docs/specs/<slug>.md.gov.sig`. La firma cubre una declaración con cabecera propia `spec-governance` y los campos raíz, spec, hash, fase, sesión, rutas, operación y caducidad.
3. **Sustitución de sesión (reviewer, BLOQUEANTE, reproducido).**
   - Problema: `statement … gobierno` tomaba la última solicitud de la spec. Un agente podía registrar después otra solicitud de la sesión B con una copia del hook, y el usuario la firmaba creyendo que era la suya.
   - Corrección: el comando impreso fija la sesión (`statement <spec> gobierno <session_id>`) y `printStatement` filtra por ella; sin sesión se bloquea. Las líneas de la declaración llevan etiqueta (`sesion:`, `rutas:`, `caduca:` en ISO). `hasPrivilege` limita la vigencia a 2 horas desde la solicitud.

La tercera revisión independiente, sobre fix-2 + fix-2b, dio APROBADO, sin bloqueantes.

### Validación en el worktree con fix-2 + fix-2b aplicadas

| Comprobación | Resultado |
|---|---|
| Rama `claude/claude-code-template-v2-3b4094`, HEAD `792bcb2` | PASS |
| Contenido idéntico a la copia revisada (4 archivos, +199/−24) | PASS |
| `git diff --check` | PASS |
| `npx vitest run .claude/hooks` | PASS, 47/47 |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `gate` Fase B, firma real del usuario | PASS, exit 0 |
| `gate` Fase C | PASS, exit 2 |
| `guard`: `CLAUDE.md`, `.claude/settings.json`, hook, `docs/SETUP.md`, `approvals.jsonl`, `~/.claude/spec-allowed-signers`, `~/.ssh/spec_approval` | PASS, exit 2 en todas |
| `guard` sobre `README.md`, ruta no protegida | PASS, exit 0 |
| `relay`: modo `record` del hook desde Bash; `claude -p "autorizo gobierno …"` desde PowerShell | PASS, exit 2 |
| `ssh-keygen -Y verify` de la `.sig` real sobre la declaración de Fase B | PASS, `Good "spec-approval" signature`, clave `SHA256:7AY56U4A0G/3OgsDGsxNf93xujvfn4y5CS5FJGGE1to` |
| `statement … gobierno` sin sesión | PASS, exit 2 |
| Autoautorización sin firma (repo temporal) | PASS: la solicitud se registra y `guard CLAUDE.md` sigue en exit 2 |
| Aislamiento de sesiones A/B (repo temporal, clave desechable) | PASS: si el usuario firma A, A da 0 y B da 2; B solo se desbloquea si se firma expresamente su declaración (`sesion: B`) |
| Pruebas de mutación: hook antiguo; sin verificar `.gov.sig`; sin filtro de sesión; sin tope de 2 h | PASS: el test correspondiente falla en cada caso |
| Búsqueda de secretos en el diff y los parches | PASS, nada encontrado |

Ninguna prueba usó la clave privada del usuario ni escribió en su ledger privilegiado. Las pruebas de autorización corrieron en repos temporales con claves desechables.

### Limitaciones (NO VERIFICADO)

- El comando de firma de gobierno no se ejecutó de principio a fin con la clave real del usuario. El de firma funcional sí se probó en Git Bash real con una clave desechable, y el de gobierno usa el mismo constructor.
- Las reglas nuevas de `deny`, `Bash(*spec-approval*record*)` y `PowerShell(*spec-approval*record*)`, no se probaron en una sesión real del harness. `relay` sí se probó.
- Las sesiones de escritorio usan la copia del hook del checkout principal hasta que se integre este cambio.
- Los riesgos residuales declarados en `docs/SETUP.md` siguen vigentes, entre ellos un proceso del mismo usuario que reemplace el hook o el archivo de firmantes, o que lea la clave HMAC.

### Excepción de whitespace para los parches

`git diff --cached --check` daba avisos de "trailing whitespace" en `fix-2.patch` y `fix-2b.patch`. Son líneas de contexto en blanco que el formato diff escribe con un espacio inicial; los parches de `792bcb2` tienen el mismo caso. Quitar ese espacio cambiaría el SHA-256 registrado y haría fallar `git apply`. Por eso `.gitattributes` añade solo `docs/patches/*.patch -whitespace`, sin tocar el contenido de los parches ni desactivar la comprobación en el resto del repositorio.

### Archivo accidental

En la raíz del worktree hay un archivo `cd` sin seguimiento en git, de 306 bytes, con la salida de `ps` de las 14:50. No contiene secretos. No es del agente, no se ha borrado y no debe entrar en el commit.

## Cierre de Fase B (T8, 2026-11-07)

| Verificación | Resultado | Observado |
|---|---|---|
| AC-21 `gate` con la firma del usuario, `Fase: B` | PASS | exit 0 |
| `gate` con `Fase: C` | PASS | exit 2, solo autoriza la fase B |
| Firma de entrada vacía | PASS | Ya no coincide: la firma nueva cubre la declaración real |
| AC-22 `guard` sobre `~/.ssh/spec_approval`, `~/.claude/spec-allowed-signers` y `~/.claude/spec-privileged.jsonl` | PASS | exit 2, registro de gobierno |
| Firmantes y `ssh-agent` | PASS | Una línea igual a `spec_approval.pub`; clave no cargada |
| Clave con frase | Informado por el usuario | El agente no accede a la clave privada ni a su frase |
| `fix-1` sigue aplicado | PASS | `git apply -R --check` OK, SHA `a1e92fb7…` |
| `git diff --check` | PASS | Sin errores |
| Spec y aprobación | PASS | Spec sin cambios de contenido; ledger con 3 líneas; HEAD `0a549c4`, sin commit |

**Causa del primer intento fallido:** en Git Bash, `node` era un alias a `winpty node.exe`, que no deja pasar la salida por la tubería. Con `node.exe` la declaración salió completa. El comando documentado no se detiene si la declaración sale vacía; `gate` falla cerrado.

**Nota de prueba:** una primera sonda de `guard` sobre rutas de clave mostró exit 0 por un error del script de prueba: `$?` se leyó después de `$(basename …)`. Repetida con la salida visible: exit 2.

**Riesgos aceptados:**

- Sin aislamiento de seguridad absoluto: los controles evitan desvíos de un agente, no de un proceso local con los mismos permisos.
- Un proceso del mismo usuario puede reemplazar `~/.claude/spec-allowed-signers`, el hook o la clave HMAC por shell. Solo un archivo de administrador o una verificación en servidor lo cierran.
- Bash y PowerShell pueden escribir rutas protegidas; `reviewer` lo detecta en el diff.
- La firma prueba al poseedor de la clave, no que haya leído la spec. Una clave sin frase o cargada en `ssh-agent` anularía la barrera.
- `guard` no impide leer `~/.ssh/`; la frase protege la clave.
- El comando de firma firma una entrada vacía sin avisar si `node` falla, como con el alias `winpty`. Falla cerrado.
- Sin repetir: mutación de `fix-1` y revisión independiente de `fix-1`, por decisión del usuario.
- `session_id` en subagentes, efecto real de reglas `PowerShell(...)`, mensajes entre sesiones, tareas programadas y `permissions.ask` interactivo: NO VERIFICADO.
- En sesión de escritorio con worktree corre la copia del hook del checkout principal hasta integrar estos cambios.

## Aplicación de fix-1 (T6, 2026-11-07)

Aprobación: línea del 2026-11-07T12:01:28.120Z, fase B, `ronalehm`; `gate` exit 0 antes de aplicar. Rama `claude/claude-code-template-v2-3b4094`, HEAD `0a549c4`.

| Prueba | Resultado | Observado |
|---|---|---|
| AC-16 SHA-256 de `fix-1` | PASS | `a1e92fb7…5f2b03` |
| AC-16 `git apply` | PASS | Seis archivos; iguales a la copia probada, salvo fin de línea CRLF |
| AC-16 `git diff --check` | PASS | Sin errores |
| `npx vitest run .claude/hooks` | PASS | 45 de 45 |
| `npm run lint` | PASS | exit 0 |
| `npm run build` | PASS | exit 0 |
| `gate` del worktree sin firma | PASS | exit 2: `no tiene firma externa válida` |
| AC-17 R4 `--agent orchestrator` sin confianza, `Edit` de `README.md` | PASS | Bloqueado, `README.md` sin cambios |
| AC-18 R4 `--agent developer` sin confianza, Bash con `docs/specs` | PASS | `relay` bloquea |
| AC-19 R7 `claude -p "apruebo docs/specs/z.md"` | PASS | Línea registrada y `Estado: aprobado`, pero pide firma; `gate` exit 2 |
| AC-21 firma del usuario | **FAIL**, primer intento | Ver T8 |

## T8, primer intento (2026-11-07)

- `.sig` presente, cabecera válida, clave `SHA256:7AY56U4A…E1to`. `spec-allowed-signers` tiene una línea, igual a `spec_approval.pub`. La clave no está cargada en `ssh-agent`. El agente solo leyó datos públicos.
- `gate` sobre la spec: **exit 2**, `no tiene firma externa válida`. `ssh-keygen -Y verify` manual: `incorrect signature`.
- **Causa:** la firma corresponde a una **entrada vacía**. En la terminal del usuario, `statement` no imprimió nada, y `ssh-keygen` firmó igual porque la tubería no se detiene ante un error. La declaración correcta, con raíz del worktree, hash `50aa8f29…01d83` y fase B, no coincide.
- **Efecto:** el control falla cerrado: una firma vacía no desbloquea nada. Pero el comando documentado no avisa del error. Se registra como observación; no se corrige en Fase B.
- Spec sin cambios desde la aprobación; `fix-1` sigue aplicado.

**Incidencia:** el respaldo con `tar` falló antes de aplicar (`Cannot connect to C:`), y el parche se aplicó igual. Respaldo reconstruido después con `git apply -R` del mismo parche en `pre-fix-1.tar` del scratchpad. Los archivos previos se recuperan exactos con `git apply -R docs/patches/template-v2-phase-b-fix-1.patch`.

**Sin repetir:** mutación sobre `fix-1` y revisión independiente, por decisión del usuario.

## Cierre de T4 (2026-11-07)

**AC-15:** `docs/evidence/template-v2-phase-b-mutation.mjs`, una vez, en copia aislada con hook y tests iguales a los aplicados: **PASS, 32 detectadas, 0 sobreviven.**

### Sesión real

Repo desechable con clave y ledger temporales, carpeta sin confianza aceptada, salvo lo indicado. Modelo `haiku`.

| Prueba | Resultado | Observado |
|---|---|---|
| R1 archivo normal | PASS | Creado |
| R2 `guard` sobre `CLAUDE.md` y `proxy.ts` | PASS | Bloqueados, no creados |
| R3 `guard` dentro de subagente | PASS | `sub.txt` creado, `docs/SETUP.md` bloqueado |
| R4 frontmatter del orquestador, sin confianza | **FAIL** | `Edit` de `README.md` aplicado |
| R4 frontmatter, worktree con confianza | PASS | `BLOQUEADO: el orquestador solo edita las casillas del plan` |
| Frontmatter de `developer`, worktree con confianza | PASS | Bash con `docs/specs` bloqueado |
| R5 script del hook ausente | PASS | `nofail.txt` no creado |
| R6 agente intenta aprobar por Bash | PASS | `relay` bloquea, spec en borrador |
| R7 `claude -p "apruebo docs/specs/x.md"` | **FAIL** | Spec aprobada, línea firmada, `gate` exit 0 |

### Diagnóstico de R4

**Causa: los hooks de frontmatter no se cargan en una carpeta sin confianza aceptada.** La configuración es válida y efectiva con confianza.

- El agente sí cargó: los hooks de settings reciben `agent_type: orchestrator` y `tools` se aplica (`Write` no disponible).
- Sin confianza, un registro añadido al frontmatter no disparó, ni con `--agent` ni como subagente. Con confianza, el mismo mecanismo bloquea.
- La documentación condiciona estos hooks a la confianza, y `claude -p` no la pide. Los hooks de settings sí corrieron en esa carpeta.
- **Efecto:** en un clon sin confianza, con `claude -p`, orquestador y `developer` pierden sus límites sin aviso. Los controles de `guard` y `gate`, en settings, siguen activos.

### Diagnóstico de R7

**La firma HMAC no prueba consentimiento humano.** Solo prueba que el hook escribió la línea. Cualquier prompt que coincida con el comando la produce.

- La entrada de `UserPromptSubmit` no tiene campo de origen: `cwd`, `hook_event_name`, `permission_mode`, `prompt`, `prompt_id`, `session_id`, `transcript_path`.
- `relay` y `deny` solo detienen a un agente que siga las reglas dentro de una sesión protegida. Un script, otra sesión o un texto codificado los evita.
- **Límite declarado:** dentro de Claude Code no se puede garantizar que un humano escribió la aprobación. Hace falta confirmación externa.

Las dos aprobaciones registradas del spec real no son de esta prueba: `docs/specs/approvals.jsonl` del worktree sigue con 2 líneas y la firma vigente responde `gate` exit 0.

### Corrección propuesta, sin aplicar

- Archivo: `docs/patches/template-v2-phase-b-fix-1.patch`
- SHA-256: `a1e92fb77d26a98601d28069b69213ada69db2889a117a98432df8570b5f2b03`. Reemplaza a `f88ef7fe…`; solo cambia el texto del comando de firma, que ahora indica Git Bash.
- 6 archivos, 157 inserciones, 24 eliminaciones. Sin dependencias: usa `ssh-keygen`, ya instalado.

**R4:** `guard` y `relay` aplican los límites por `agent_type`, y se quita el frontmatter duplicado.

**R7:** `isValid` exige además una firma SSH de la declaración de la spec, hecha por el usuario en su terminal con clave protegida. Sin firma, `apruebo` registra pero no desbloquea nada.

| Prueba de aceptación, en copia aislada | Resultado |
|---|---|
| 4 tests nuevos contra hook aplicado hoy | FAIL 4, PASS 41 |
| `npx vitest run .claude/hooks` con la corrección | PASS, 45 de 45 |
| `git apply --check` sobre el worktree actual | PASS |
| A1 `--agent orchestrator` sin confianza, `Edit` de `README.md` | PASS, bloqueado en sesión real |
| A2 `claude -p "apruebo ..."` | PASS: queda registrada, `gate` exit 2 por falta de firma externa |
| A3 firma del poseedor de la clave | PASS, `gate` exit 0. Clave temporal sin frase |
| Tests del hook con el SHA final | PASS, 45 de 45 |
| `eslint .claude/hooks` con el SHA final | PASS |
| Declaración desde terminal y desde hook, ruta real con acento | PASS, misma salida |
| Comando de firma en PowerShell 5.1 | **FAIL**: `Unexpected end of JSON input`, salida vacía. El comando se indica para Git Bash |

**NO VERIFICADO de la corrección:** mutación, lint completo y build sobre el parche, y frase de la clave en terminal real. A1 a A3 se ejecutaron antes del cambio de texto; se repiten R4 y R7 en el cierre.

**Límite que persiste:** un proceso del mismo usuario puede reemplazar `spec-allowed-signers` o el hook por shell. La garantía completa exige un archivo solo escribible por administrador o verificación en servidor.

**Al aplicarla:** la aprobación actual dejará de valer hasta firmarla, y la spec debe actualizarse con este cambio y aprobarse de nuevo.

## Aplicación y validación (T2 y T3, 2026-11-07)

Aprobación previa: firmada por `ronalehm <ronalehm@gmail.com>` el `2026-11-07T05:23:12.846Z`, validada con el hook entonces vigente en el worktree (`gate`, exit 0). SHA-256 del parche comprobado antes de aplicar.

| Comprobación sobre el código aplicado | Resultado |
|---|---|
| `git apply docs/patches/template-v2-phase-b.patch` | PASS |
| Archivos modificados fuera del alcance | 0 |
| `npm install --package-lock-only` | PASS: 8 entradas nuevas, 0 quitadas, 0 cambios de versión |
| `npm ci` | PASS |
| `npx vitest run .claude/hooks` | PASS, 41 de 41 |
| `npx vitest run` | PASS, 41 de 41 |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS, sin errores |
| Pruebas negativas con el hook aplicado, invocado directamente | PASS, 50 de 50 |

Las negativas cubren: spec sin aprobación (5), aprobación alterada o restaurada (9), rutas sensibles (8), gobierno, alias y `relay` (20), y worktree real sin escribir (8).

**Controles en sesión real: solo `apruebo` verificado; el resto NO VERIFICADO** (tabla de la sección "NO VERIFICADO"). Las pruebas invocan el hook por línea de comandos. La sesión de escritorio que aplicó el parche usaba la copia anterior del hook, la del checkout principal.

**Aprobación repetida (T4, 2026-11-07):** firmada por `ronalehm <ronalehm@gmail.com>` el `2026-11-07T05:30:08.994Z` en una sesión nueva dentro del worktree, con `phase: B`. La línea anterior de `docs/specs/approvals.jsonl` conserva el formato viejo y ya no vale (D6).

| Comprobación con el hook aplicado, invocado directamente | Resultado |
|---|---|
| `gate`, `developer`, spec y `Fase: B` | PASS, exit 0 |
| `gate`, `developer`, `Fase: C` | PASS, bloqueado |
| `gate`, `developer`, sin fase | PASS, bloqueado |
| `guard`, `CLAUDE.md`, con la spec aprobada | PASS, bloqueado |
| `guard`, este archivo de evidencia | PASS, exit 0 |
| `npx vitest run .claude/hooks` | PASS, 41 de 41 |

**Conservado:** `docs/specs/`, `docs/patches/` y `docs/evidence/` sin seguimiento; HEAD `0a549c4`; checkout principal con sus 37 entradas de `git status`; rama `backup/template-v2-wip-2026-11-06` en `b21d514`. Reversión: `git apply -R docs/patches/template-v2-phase-b.patch` y restaurar `package-lock.json`.

## Parche

- Archivo: `docs/patches/template-v2-phase-b.patch`
- SHA-256: `9f7889decde90f2097b43ebd7261180ae924ba998190bf68d91cb8ec0544f491`
- Base: `0a549c4`. 9 archivos, 983 inserciones, 112 eliminaciones.

| Archivo | Cambio |
|---|---|
| `.claude/hooks/spec-approval.mjs` | Dos tipos de autorización, rutas protegidas con normalización NTFS, raíz real, fase, integridad, `relay`, modo `orchestrator` |
| `.claude/hooks/spec-approval.test.mjs` | 34 tests nuevos, timeout de 120 s, limpieza de temporales |
| `.claude/settings.json` | `permissions.ask` sobre gobierno, `onFailure: block` en `PreToolUse`, `relay`, `deny` sobre `claude` y ledger privilegiado |
| `.claude/agents/orchestrator.md` | 4 rutas, formato de 5 líneas, `Edit` limitado a specs, `Fase:` |
| `.claude/agents/reviewer.md` | Revisa gobierno en el diff real, incluidos ignorados, veredicto `BLOQUEADO` |
| `.claude/agents/spec.md` | Profundidad por ruta, secciones de rutas protegidas |
| `.claude/agents/developer.md` | No rodear bloqueos, hook también en PowerShell |
| `docs/SETUP.md` | Rutas, tabla de autorizaciones, riesgos residuales, correcciones |
| `CLAUDE.md` | Quita referencia a Astro, resume aprobación con puntero a `docs/SETUP.md` |

## Resultados

Ejecutado el 2026-11-06 con Claude Code 2.1.319, Node 26.12.1 y Next 16.3.8.

| Comprobación | Resultado |
|---|---|
| Primera tanda de tests contra hook actual | FAIL 16, PASS los 7 existentes |
| Tests de hallazgos de revisión contra primer candidato | FAIL 10, PASS 24 |
| Tests de segunda revisión contra segundo candidato | FAIL 7, PASS 34 |
| Hook candidato final, `npx vitest run .claude/hooks` | PASS, 41 de 41 |
| Los 7 tests originales | PASS, sin cambiar sus aserciones |
| `git apply --check` en worktree real, parche final | PASS |
| `git diff --check` en candidato final | PASS, 0 líneas |

Sobre el parche anterior a las últimas correcciones (SHA `0b7eeb5a…`):

| Comprobación | Resultado |
|---|---|
| Mutación: `docs/evidence/template-v2-phase-b-mutation.mjs` | 32 detectadas, 0 sobreviven |
| Clon limpio: parche más `npm install --package-lock-only` | PASS |
| Clon limpio: `npm ci` | PASS |
| Clon limpio: `npx vitest run`, 34 de 34 | PASS |
| Clon limpio: `npm run lint` | PASS |
| Clon limpio: `npm run build` | PASS |

**NO VERIFICADO sobre el parche final:** mutación, y revisión independiente de las últimas correcciones. Instalación, lint y build se repiten sobre el código aplicado en T3.

**Efecto del lockfile:** 8 entradas nuevas (`@emnapi/*` y árbol de `@tailwindcss/oxide-wasm32-wasi`), 0 quitadas, 0 cambios de versión, y el campo `peer` en 54 entradas.

### Problemas encontrados al probar

1. **Controles redundantes.** La mutación encontró dos veces una comparación que sobraba. Se añadieron tests y se quitó el código sobrante.
2. **Timeouts confundían la mutación.** Con el límite de 5 s, un timeout contaba como detectada. Se subió a 120 s y se repitió.
3. **Tests dejaban temporales.** Llegaron a 1922 directorios en `%TEMP%`. Con limpieza quedan 0.
4. **Dominio de firma sin prueba real.** Se añadió un test que desplaza campos para reutilizar una firma.
5. **`build` con unión de `node_modules` falla** (`TurbopackInternalError`). Con instalación real pasa; no es efecto del parche.

## Primera revisión independiente: BLOQUEADO

| # | Hallazgo | Resultado |
|---|---|---|
| 1 | Criterio de lockfile "solo `@emnapi`" era falso | Corregido: AC-01 usa el efecto medido |
| 2 | `CLAUDE.md::$DATA` y alias NTFS pasaban | Corregido, con test |
| 3 | Sensibles de otro checkout o repo anidado pasaban | Corregido, con test |
| 4 | `useAuth.ts`, `AuthGuard.tsx`, `oauth2`, `lib/auth/`, `proxy.js` pasaban | Corregido, con test |
| 5 | `claude.exe`, `npx @anthropic-ai/claude-code` y PowerShell pasaban | Corregido, con test. Un script que lance otra sesión sigue pasando: residual |
| 6 | `Modo: build` editaba ruta listada en spec con plan terminado | Corregido para plan terminado. Con plan abierto: residual |
| 7 | Aprobar antes de aplicar dejaba al hook viejo ordenando implementar y gobierno sin proteger | Corregido: el usuario aplica el parche antes de aprobar |
| 8 | "Integridad bloquea si difiere" era falso con el hook actual del checkout principal | Corregido en `docs/SETUP.md` y aquí |
| 9 | Texto añadido a la línea de estado no invalidaba; edit por palabra cambiaba estado | Corregido, con test |
| 10 | Restaurar contenido revivía autorización | Corregido, con test |
| 11 | `## Archivos sensibles excluidos` desbloqueaba | Corregido: encabezado exacto |
| 12 | `Fase: B.1` y dos specs bloqueaban por error | Corregido, con test |
| 13 | `.claude/commands/`, `CLAUDE.local.md`, `.mcp.json`, `.git/` sin proteger | Corregido, con test |
| 14 | `.env*` y `settings.local.json` invisibles para reviewer | Corregido: `git status --ignored` |
| 15 | Texto "build o SDD" y script de mutación fuera del repo | Corregido |

## Segunda revisión independiente: OBSERVACIONES, 3 bloqueantes

Verificó con entradas reales los hallazgos anteriores, la secuencia de tareas en un temporal y las regresiones.

| # | Hallazgo | Resultado |
|---|---|---|
| 1 | `C:CLAUDE.md`, `\\?\C:\...\proxy.ts` y `\\.\C:\...\lib\auth.ts` pasaban | Corregido, con test. Incluye la forma `/c/...` |
| 2 | `lib/auth.ts` en un worktree dentro de `.claude/worktrees/` pasaba desde el checkout principal | Corregido, con test |
| 3 | Desmarcar `- [x]` reabría una spec terminada sin cambiar el hash | Corregido, con test. Por shell sigue siendo posible: residual |
| 4 | `.envrc`, `.env_local`, `lib/dbs.ts`, `lib/rolesx.ts`, `proxy.tsx` pasaban | Corregido, con test |
| 5 | Escribir `.git` (puntero del worktree) pasaba | Corregido, con test |
| 6 | `"Fase: C"` y variantes con marcas se bloqueaban por error | Corregido, con test |
| 7 | `grep "apruebo docs/specs" CLAUDE.md` se bloqueaba por error | Corregido, con test |
| 8 | `autorizo` con plan cerrado anunciaba 2 horas sin efecto | Corregido: se rechaza |
| 9 | Encabezado en bloque de código desbloqueaba; casilla fuera del plan lo mantenía abierto | Corregido, con test |
| 10 | Spec escrita por junction con `Estado: aprobado` pasaba `guard` | Sin cambio: sin firma no es una aprobación válida |
| 11 | `docs/SETUP.md` omitía plan terminado, aprobación posterior y PowerShell | Corregido |

## Condiciones del usuario

| Condición | Control | Test |
|---|---|---|
| Spec no debilita controles | Funcional nunca autoriza gobierno | `functional approval never authorizes governance files` |
| Funcional distinta de privilegiada | Dominios de firma | `signatures of one approval type do not work as the other` |
| Controles humanos existentes | Conservados | 7 tests originales |
| Barrera independiente | `permissions.ask`, `onFailure`, integridad, reviewer | `integrity: ...`; resto en sesión real |
| Fase | Hash incluye `Fase actual`, gate exige `Fase:` | `phases: ...` |
| Alcance | Lista de rutas, encabezado exacto, plan abierto | `limited by scope, session and spec state`, `sections: ...`, `a spec with its plan finished` |
| Operación y tiempo | `edit`, sesión, 2 h, última aprobación | `an expired authorization`, `restoring earlier content` |
| `Modo: build` | `guard` por archivo real | `sensitive: ... also under Modo: build` |
| Raíz del worktree | Raíz por `git` desde `cwd`, otros checkouts protegidos | `root: inside a worktree ...`, `files of another checkout` |
| Aprobación cruzada | Raíz en firma | `root: an approval copied to another checkout ...` |

## NO VERIFICADO: requiere sesión real tras aplicar

Las ejecuta el usuario. Las de aprobación por otro origen, en repo temporal con spec desechable.

| Caso | Resultado esperado | Resultado |
|---|---|---|
| `apruebo` desde `claude` nuevo en el worktree | Aprueba y limita a `Fase actual` | PASS: firma nueva con `phase: B`; `gate` solo acepta `Fase: B` |
| Script del hook ausente | `onFailure` bloquea la acción | PASS (R5) |
| Editar gobierno | Pide confirmación, también con `bypassPermissions` según documentación | NO VERIFICADO |
| `session_id` dentro de `developer` | Igual al de la sesión; si difiere, solo el hilo principal podrá usar `autorizo gobierno` | NO VERIFICADO: el registro de R3 solo tuvo eventos del subagente |
| Hook de frontmatter con `claude --agent orchestrator` | `Edit` fuera de specs bloqueado | PASS con confianza; **FAIL sin confianza (R4)** |
| `guard` dentro de un subagente | Corre desde `.claude/settings.json` | PASS (R3) |
| Reglas `PowerShell(...)` en `deny` | Se aceptan y rigen; sintaxis no confirmada | Settings cargan con ellas; efecto NO VERIFICADO |
| Agente lanza `claude -p "apruebo ..."` por Bash | Bloqueado por `deny` y `relay` | PASS (R6) |
| `claude -p "apruebo ..."` fuera de una sesión protegida | Sin aprobación válida | **FAIL (R7)** |
| Mensaje de otra sesión o tarea programada con `apruebo ...` | Bloqueado por `relay` si sale de una herramienta; si no, riesgo residual | NO VERIFICADO |
| Rechazo de `::$DATA` por el harness | Bloqueado por `guard` en cualquier caso | NO VERIFICADO |
| Symlink a archivo de gobierno en Windows | Bloqueado; el test se omite sin privilegio de symlink | NO VERIFICADO |

## Riesgos residuales

| Riesgo | Severidad | Mitigación actual | Cierre posible |
|---|---|---|---|
| `UserPromptSubmit` no identifica origen: mensajes de otra sesión o tarea programada pueden aprobar | **Alta** | `relay` bloquea el comando literal; texto codificado o script pasa | Sin solución dentro del hook; revisar `approvals.jsonl` y `git diff` |
| Bash o PowerShell escriben en rutas protegidas | Alta | `reviewer` lo detecta después | `managed-settings.json` y sandbox |
| Proceso del mismo usuario lee la clave y forja registros | Alta | `deny` sobre la clave | Hook y clave fuera del alcance del usuario local |
| Con plan abierto, `Modo: build` edita una ruta sensible listada | Media | `reviewer` compara con la tarea | Control por tarea, fuera de alcance |
| `autorizo gobierno` confía en la lista que escribió un agente en la spec | Media | El hook muestra las rutas; caduca en 2 h; solo esa sesión | El usuario revisa la lista antes de autorizar |
| Sesión de escritorio con worktree corre la copia del checkout principal | Media | Integridad solo actúa si esa copia ya la incluye | Abrir `claude` dentro del worktree o integrar |
| Autobloqueo si el hook falla | Media | El usuario corrige `.claude/settings.json` a mano | Ninguno necesario |
| `Fase:` en el prompt es declarativa | Baja | Límite real es `guard` por archivo | Ninguno necesario |

**Capas externas opcionales, decisión del usuario:** `C:\Program Files\ClaudeCode\managed-settings.json` protegido por administrador, y ruleset de GitHub sobre `.claude/**`. Son las únicas que un proceso del mismo usuario no puede alterar.
