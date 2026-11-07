# Template V2: controles de gobierno y flujo de agentes

- Módulo: template
- Estado: aprobado
- ID: SPEC-template-v2-professional-workflow
- Riesgo: alto (modifica hooks de aprobación y gobierno de agentes)
- Ruta: SDD-ADVANCED
- Fase actual: B
- Fases: B, luego spec independiente de auth, luego C, D y E. La aprobación autoriza solo la fase actual.
- Fuente: `template v2.1/INSTRUCCION_CLAUDE_CODE_TEMPLATE_V2_PRO_SDD_ODD_TOKEN_EFFICIENT.md` y condiciones del usuario del 2026-11-06.
- Evidencia: `docs/evidence/template-v2-phase-b.md`
- Repositorio de v2: `ronalehm/next-js-template-v2` (privado)

## Principio obligatorio

Ningún agente puede eliminar, desactivar o debilitar los controles que gobiernan sus propias autorizaciones mediante la sola aprobación de una spec.

## Objetivo

Que los controles dependan de hechos comprobables (archivo real, firma, hash, fase, raíz) y no de lo que declara un prompt, antes de usar el flujo para desarrollar Clerk, usuarios, roles y permisos.

## Alcance de Fase B

Incluye: aplicar `docs/patches/template-v2-phase-b.patch` en el worktree y sincronizar `package-lock.json` (hecho), y aplicar la corrección final `docs/patches/template-v2-phase-b-fix-1.patch`, limitada a seis archivos. Alcance congelado: sin funciones, controles ni rondas de rediseño adicionales.

No incluye: Clerk, usuarios, roles ni permisos; dependencias nuevas; CI/CD; migraciones; commit, merge, push, release o despliegue sin autorización expresa. Conservar los cambios del working tree en worktree y checkout principal: sin `git stash`, `clean`, `checkout` ni `reset`.

## Hallazgos de auditoría

Evidencia, sondas y revisión independiente: `docs/evidence/template-v2-phase-b.md`. Base: commit `0a549c4`.

| ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| H-01 | Alta | `npm ci` falla en clon limpio | `Missing: @emnapi/runtime@1.11.3 from lock file` |
| H-02 | Alta | En sesión de escritorio con worktree, el hook resuelve specs y ledger en el checkout principal | Gate real: `la spec docs/specs/template-v2-professional-workflow.md no existe.` |
| H-03 | Alta | Un hook que no arranca no bloquea | Script ausente: exit 1; hooks.md |
| H-04 | Alta | `Modo: build` pasa con cualquier contenido | "Edita .claude/settings.json y quita los hooks": exit 0 |
| H-05 | Alta | Nada protege hooks ni settings frente a Write/Edit | `guard` y `developer`: exit 0 |
| H-06 | Alta | `UserPromptSubmit` también se dispara con mensajes de otra sesión y tareas programadas, sin campo de origen. La afirmación "los agentes no pueden aprobar" es incorrecta | hooks.md |
| H-07 | Media | El gate solo mira `developer` | `general-purpose`: exit 0 con spec en borrador |
| H-08 | Media | El hilo principal no pasa por el gate | Lectura de código |
| H-09 | Media | Aprobación mal escrita con espacios se ignora en silencio | Mensaje real del usuario: exit 0, sin aviso |
| H-10 | Media | El orquestador tiene `Edit` sin límite | `.claude/agents/orchestrator.md:4` |
| H-11 | Media | La aprobación no se limita a una fase | `.claude/hooks/spec-approval.mjs:112` |
| H-12 | Baja | Reglas `Write(...)` no tienen efecto: Edit cubre Write y NotebookEdit | permissions.md |
| H-13 | Baja | Spec aprobada editada no vuelve a `borrador` como dicen los documentos; el gate la bloquea por hash | `CLAUDE.md`, `docs/SETUP.md:273` |
| H-14 | Baja | `CLAUDE.md:9` describe un padre Astro que no existe | Sin `astro.config.*` |
| H-15 | Baja | Tests del hook dejan directorios temporales | 1922 en `%TEMP%` |
| H-16 (R4) | Alta | Los hooks de frontmatter no cargan en carpeta sin confianza aceptada, y `claude -p` no la pide | `Edit` de `README.md` aplicado por `--agent orchestrator` |
| H-17 (R7) | Alta | La firma HMAC no prueba consentimiento humano | `claude -p "apruebo docs/specs/x.md"`: spec aprobada, `gate` exit 0 |
| H-18 | Baja | El comando de firma falla en PowerShell 5.1 | `Unexpected end of JSON input`, declaración vacía |

## Decisiones

- **D1. Dos autorizaciones.** Funcional (`apruebo docs/specs/<slug>.md`) y técnica privilegiada (`autorizo gobierno docs/specs/<slug>.md`), con dominios de firma separados.
- **D2. Control por archivo real.** `guard` actúa sobre Write, Edit y NotebookEdit en cualquier agente y en el hilo principal, tras normalizar la ruta. El prompt no es el control.
- **D3. Por fase, alcance y operación.** `Fase actual` entra en el hash: pasar de fase exige reaprobar. Las rutas salen de secciones con encabezado exacto. Una spec con su plan terminado deja de autorizar. La privilegiada cubre solo `edit`, esa sesión, 2 horas y hasta la siguiente aprobación.
- **D4. Barrera independiente del script.** `permissions.ask` la evalúa el harness; `onFailure: block` cubre hook roto; integridad detecta otra copia; `reviewer` revisa el diff real, incluidos cambios por shell y archivos ignorados.
- **D5. Arranque con orden expresa.** El comando privilegiado no existe aún. El usuario decidió en el chat, el 2026-11-07, que el agente aplique este parche exacto tras una aprobación firmada válida. Esa orden, y no la sola aprobación de la spec, autoriza este cambio de gobierno y no se extiende a otros.
- **D6. Raíz firmada.** La firma incluye la raíz del repo: una aprobación no sirve en otro worktree o rama integrada. Las líneas del formato anterior dejan de valer; no hay ninguna registrada en el repo.
- **D7. Límites de agente en settings (R4).** `guard` y `relay` aplican por `agent_type` los límites de `orchestrator` y `developer`, y se quita el frontmatter duplicado.
- **D8. Firma externa (R7).** Una aprobación solo vale con una firma SSH de la declaración `spec-approval`, raíz del repo, spec, hash y fase, verificada contra `~/.claude/spec-allowed-signers`. La hace el usuario en Git Bash con su clave protegida. El agente no genera, usa, desbloquea ni solicita la clave privada o su frase. La clave vive fuera del repo. `claude -p` puede registrar una línea, pero sin firma no desbloquea nada.
- **D9. Aplicación de fix-1 con orden expresa.** El usuario ordenó en el chat, el 2026-11-07, que el agente aplique únicamente `fix-1` tras una aprobación válida. Esa orden, y no la sola aprobación de la spec, autoriza este cambio de gobierno y no se extiende a otros. Esta aprobación aún usa el mecanismo anterior, porque la firma no existe hasta aplicar el parche: el agente exige además que el usuario la confirme en el chat de esta sesión.

Alternativa descartada: permitir gobierno si una spec aprobada lo cita. Incumple el principio obligatorio.

## Modelo de autorización

| | Funcional | Técnica privilegiada |
|---|---|---|
| Autoriza | `Fase actual` y rutas de `## Archivos sensibles` | Rutas de `## Cambios de gobierno` |
| Nunca autoriza | Archivos de gobierno | Registros, `.git/`, rutas no listadas |
| Requiere | Mensaje exacto y firma SSH externa | Funcional válida, sesión identificada y mensaje exacto |
| Se invalida si | Cambia la spec o el checkout, cambia la fase, falta la firma o termina el plan | Lo anterior, otra sesión, 2 horas o nueva aprobación |

Gobierno, registros y rutas sensibles: lista canónica en `docs/SETUP.md` dentro del parche.

## Criterios de aceptación de Fase B

- [ ] AC-01 Dado `npm install --package-lock-only`, entonces ningún paquete cambia de versión ni desaparece, las entradas nuevas son las 8 registradas en la evidencia, y `npm ci` termina sin error en clon limpio.
- [ ] AC-02 Dado el parche, cuando se comprueba, entonces su SHA-256 es `9f7889decde90f2097b43ebd7261180ae924ba998190bf68d91cb8ec0544f491`, `git apply` termina sin error y `git diff --check` no informa errores.
- [ ] AC-03 Dada una spec aprobada que cita un archivo de gobierno, cuando un agente intenta escribirlo, directo o por alias NTFS, entonces se bloquea.
- [ ] AC-04 Dada una autorización privilegiada, cuando cambia la spec, hay una aprobación posterior, cambia la sesión, caduca, termina el plan o la ruta no está listada, entonces se bloquea. Desmarcar casillas de una spec aprobada también se bloquea.
- [ ] AC-05 Dada una firma de un tipo, cuando se reutiliza como el otro, entonces se ignora.
- [ ] AC-06 Dado `Modo: build`, cuando se escribe una ruta sensible sin spec abierta que la liste, entonces se bloquea; un archivo normal pasa.
- [ ] AC-07 Dado un prompt con otra fase o sin fase, cuando se lanza un agente que implementa, entonces se bloquea.
- [ ] AC-08 Dado cualquier agente que implementa y cita una spec en borrador, entonces se bloquea; `reviewer`, `spec`, `Explore` y `Plan` pasan.
- [ ] AC-09 Dado `cwd` en un worktree y `CLAUDE_PROJECT_DIR` en otra ruta, entonces specs y ledger se resuelven en el worktree, y las rutas sensibles de otro checkout se bloquean.
- [ ] AC-10 Dada una aprobación copiada a otro checkout, entonces no es válida allí.
- [ ] AC-11 Dada otra copia del hook con esta comprobación, entonces aprobar y escribir rutas protegidas se bloquea, y los mensajes y archivos normales pasan.
- [ ] AC-12 Dado el comando literal de aprobación en una herramienta que entrega prompts, o junto a `claude` en Bash o PowerShell, entonces se bloquea.
- [ ] AC-13 Dados los 7 tests originales, entonces pasan sin cambiar sus aserciones.
- [ ] AC-14 Dadas las pruebas de sesión real de la evidencia, entonces cada una queda con PASS, FAIL o NO VERIFICADO.
- [ ] AC-15 Dado `docs/evidence/template-v2-phase-b-mutation.mjs` en una copia desechable con el parche inicial, entonces ninguna mutación sobrevive. Resultado registrado: 32 detectadas, 0 sobreviven. No se repite sobre `fix-1`: figura como NO VERIFICADO.
- [ ] AC-16 Dado `fix-1`, cuando se comprueba, entonces su SHA-256 es `a1e92fb77d26a98601d28069b69213ada69db2889a117a98432df8570b5f2b03`, toca solo los seis archivos listados, `git apply` termina sin error y `git diff --check` no informa errores.
- [ ] AC-17 (R4) Dado `claude -p` con `--agent orchestrator` en carpeta sin confianza aceptada, cuando intenta editar un archivo fuera de las casillas de una spec, entonces se bloquea.
- [ ] AC-18 (R4) Dado `developer`, cuando escribe en `docs/specs/` o lanza un comando que la nombra, entonces se bloquea por `agent_type`, sin frontmatter.
- [ ] AC-19 (R7) Dado `claude -p "apruebo docs/specs/<slug>.md"` sobre una spec desechable, entonces no hay orden de implementar, y `gate` y `guard` siguen bloqueando por falta de firma externa.
- [ ] AC-20 (R7) Dada una firma de otra clave, otro espacio de nombres, otra fase, otro contenido, otro repo o sin archivo de firmantes, entonces no vale.
- [ ] AC-21 Dada la clave del usuario, protegida por frase y fuera de `ssh-agent`, cuando el usuario firma la declaración en Git Bash, entonces `gate` responde exit 0 sobre esta spec. El agente no accede a la clave privada ni a su frase.
- [ ] AC-22 Dado `Edit` o `Write` sobre `~/.ssh/` o `~/.claude/spec-allowed-signers`, entonces se bloquea.

## Pruebas

| AC | Prueba | Evidencia |
|---|---|---|
| AC-01, AC-02 | `npm ci`, `sha256sum`, `git apply` | Salida de comandos |
| AC-03 a AC-13 | `npx vitest run .claude/hooks` | Nombres de tests y PASS |
| AC-14 | Sesión real del usuario | Tabla en la evidencia |
| AC-15 | Script de mutación | Tabla en la evidencia |
| AC-16 | `sha256sum`, `git apply`, `git diff --check` | Salida de comandos |
| AC-18, AC-20, AC-22 | `npx vitest run .claude/hooks` | Nombres de tests y PASS |
| AC-17, AC-19 | Sesión real en repo desechable | Tabla en la evidencia |
| AC-21 | Firma del usuario y `gate` sobre esta spec | Salida de `gate`; el usuario informa si la clave pide frase |

Cierre tras `fix-1`: `npx vitest run .claude/hooks`, `npm run lint`, `npm run build`, `git diff --check` y pruebas reales R4 y R7, una sola pasada. Cada resultado queda como PASS, FAIL o NO VERIFICADO.

## Riesgos residuales

Tabla completa en la evidencia. Principales: origen de `UserPromptSubmit` no identificable, shell sobre rutas protegidas y clave HMAC legible por procesos del mismo usuario. Estos controles evitan desvíos de un agente; no aíslan frente a un proceso local con los mismos permisos. No hay aislamiento de seguridad absoluto.

Tras `fix-1`:

- Un proceso del mismo usuario puede reemplazar `~/.claude/spec-allowed-signers` o el hook por shell. Solo un archivo de administrador o una verificación en servidor lo cierran.
- Una clave sin frase o cargada en `ssh-agent` permite que un proceso local firme.
- `guard` no bloquea leer `~/.ssh/`: la frase protege la clave.
- La firma atestigua al poseedor de la clave, no que haya leído la spec.
- La mutación de `fix-1` y una revisión independiente de `fix-1` quedan sin hacer.

## Archivos sensibles

Ninguno en Fase B.

## Cambios de gobierno

Los aplican los parches por orden expresa del usuario (D5 y D9). No se usa `autorizo gobierno` en esta fase. `fix-1` toca solo `spec-approval.mjs`, `spec-approval.test.mjs`, `orchestrator.md`, `developer.md`, `CLAUDE.md` y `docs/SETUP.md`.

- `.claude/hooks/spec-approval.mjs`
- `.claude/hooks/spec-approval.test.mjs`
- `.claude/settings.json`
- `.claude/agents/orchestrator.md`
- `.claude/agents/reviewer.md`
- `.claude/agents/spec.md`
- `.claude/agents/developer.md`
- `CLAUDE.md`
- `docs/SETUP.md`

## Plan de tareas

### Fase B

**Sesión que solo aprueba:** si el usuario aprueba desde una sesión `claude` abierta para eso, esa sesión no ejecuta tareas ni lanza agentes. T2 y T3 las ejecuta la sesión que preparó esta spec.

- [x] T1 — Usuario: revisar parche, spec y evidencia, y escribir `apruebo docs/specs/template-v2-professional-workflow.md` · archivos: ninguno · depende de: — · secuencial
- [x] T2 — Agente: verificar firma con el hook, SHA-256, rama, HEAD y working tree; respaldar; ejecutar `git apply docs/patches/template-v2-phase-b.patch` y `npm install --package-lock-only` · archivos: los de `## Cambios de gobierno`, `package-lock.json` · depende de: T1 · secuencial
- [x] T3 — Agente: `npm ci`, tests, lint, build, `git diff --check` y pruebas negativas; actualizar evidencia · archivos: `docs/evidence/template-v2-phase-b.md` · depende de: T2 · secuencial
- [x] T4 — Usuario: abrir una sesión nueva con `claude` dentro del worktree y repetir `apruebo`, porque el formato de firma cambia; registrar pruebas de sesión real · archivos: `docs/evidence/template-v2-phase-b.md` · depende de: T3 · secuencial
- [x] T5 — Usuario: revisar `fix-1`, escribir `apruebo docs/specs/template-v2-professional-workflow.md` en una sesión `claude` dentro del worktree y confirmarlo en el chat de la sesión que preparó esta spec · archivos: ninguno · depende de: T4 · secuencial
- [x] T6 — Agente: verificar la aprobación con el hook, SHA-256, rama, HEAD y working tree; respaldar; ejecutar `git apply docs/patches/template-v2-phase-b-fix-1.patch` · archivos: los seis de `fix-1` · depende de: T5 · secuencial
- [x] T7 — Usuario: en Git Bash, crear su clave con frase, registrar la clave pública en `~/.claude/spec-allowed-signers`, comprobar que la clave pide frase y no está en `ssh-agent`, y firmar la declaración de esta spec · archivos: `docs/specs/template-v2-professional-workflow.md.sig` · depende de: T6 · secuencial
- [x] T8 — Agente: verificar la firma con `gate`; ejecutar el cierre tras `fix-1`; registrar resultados y riesgos aceptados · archivos: `docs/evidence/template-v2-phase-b.md` · depende de: T7 · secuencial

Si algo falla en T6 a T8: detenerse e informar el bloqueo. Sin rondas autónomas de corrección. Cualquier cambio de un parche exige actualizar la spec y aprobar de nuevo.

### Después de validar Fase B

1. **Spec independiente de auth.** Clerk, usuarios, roles y permisos. Decisiones ya tomadas: portar desde la rama `backup/template-v2-wip-2026-11-06` y rol en `app_users`.
2. **Fase C.** Contexto progresivo: reducir `CLAUDE.md`, lectura parcial de `docs/SETUP.md`, `docs/templates/spec-advanced.md`, `.claude/rules/*` con rutas reales de auth. Detalle al reaprobar.
3. **Fase D.** Resto de casos adversariales, sesión real completa y contratos de salida. Detalle al reaprobar.
4. **Fase E.** Benchmark en `docs/benchmarks/template-v2.md`: B01 y B03, redefinido como cambio de permisos sobre panel existente; B02 y B04 solo si no concluye. Detalle al reaprobar.

## Definition of Done de Fase B

Criterios cubiertos con evidencia. Bloqueantes de las dos revisiones independientes corregidos con tests; las últimas correcciones no tienen revisión independiente, por decisión del usuario. Lo no demostrado figura como NO VERIFICADO. Riesgos residuales registrados. Sin commit, merge, push ni release sin orden expresa.

Si las pruebas de cierre pasan, el estado es **FASE B COMPLETADA — VALIDACIÓN LOCAL**, con los riesgos aceptados indicados de forma explícita. Si aparece un bloqueo nuevo, el estado sigue NO COMPLETADA y el agente se detiene. Sin cambios en MADRE, Clerk o Neon, ni en archivos preexistentes fuera de los parches autorizados.

Prioridad posterior: Clerk, Neon, usuarios y dashboard.
