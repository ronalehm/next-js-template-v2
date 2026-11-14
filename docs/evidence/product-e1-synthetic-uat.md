# Registro UAT sintético: PRODUCT-E1

Formato: `docs/forms/uat.md` (secciones 5 y 6). Patrón: `docs/evidence/users-inv-eua-uat.md`. Registro único de las rondas SINTÉTICAS de PRODUCT-E1 (spec `governance-product-uat-commands`); cada ronda es una sección y se añaden más al final. Todos los resultados son preliminares.

## Portada

- Carácter: SINTÉTICO y preliminar. Rondas ejecutadas con un brief de demostración (kit UAT), no una entrega real. No hay PR, Issue ni ticket reales; no se crean Issues.
- Identificadores ficticios (no equivalen a personas ni artefactos reales): Paula Producto Ficticia (Validador), Dana Dev Ficticia, Rita Reviewer Ficticia, Pablo Publicador Ficticio, PR #900 «Demo: listado de usuarios», rama `feat/demo-users`, DEMO-ADJ-01, entorno `http://127.0.0.1:3100` y rama Neon `uat-demo-900` (ficticios).
- Versión de prueba: `cea9044119c5db978e6b967047af6d1aa55ef12c` (checkout `h-sesiones`; coincide con `git rev-parse HEAD`, verificado por `product` en la sesión de la ronda 1a). Ronda 2 (AC-C21): `dd522b4be0b5885529dc139262f21c06badd6928` (clon `<ruta local>`, `clones\run-c21` del kit uat-e1-focal; coincide con `git rev-parse HEAD` ejecutado por `product`).
- Consolas: Windows PowerShell 5.1 y Git Bash. Claude Code, `claude --agent product`.
- Fecha de las sesiones: 2026-11-14 UTC (2026-11-13 hora local).
- Fuentes: transcripciones JSONL de las sesiones (`~/.claude/projects/<carpeta-de-sesión-sintética>/`). Las exportaciones `/export` (S1a-c19-powershell.txt, S1b-c19-powershell-irm.txt, S1c-c19-gitbash.txt) no existen: PENDIENTE en `<ruta local>/sesiones/` (en ese directorio solo hay `turnos/`). Ronda 2: transcripción JSONL de la única sesión de la carpeta del clon `run-c21`; la exportación `S2-c21.txt` no existe: PENDIENTE en `<ruta local>/sesiones/S2-c21.txt`.
- Secciones: Ronda 1 (AC-C19, terminales); Ronda 2 (AC-C21, card multipaso solo UI). AC-C16 y AC-C18(b) no se repiten aquí; AC-C18(b) está en `docs/evidence/users-inv-eua-uat.md`.

Reservas conocidas:

- Las tres sesiones son separadas; cada una es un paquete UAT-02 independiente, no una única ronda.
- Los resultados son sintéticos y no equivalen a `apruebo` ni a `autorizo gobierno`; no habilitan merge, PR ni liberación.
- La aceptación funcional de Paula Producto Ficticia es PENDIENTE en las tres sesiones (no se inventa aceptación de una identidad sintética).
- Datos de infraestructura del brief enmascarados con dominios reservados (`example.test`, `example.net`); sin credenciales.
- El resumen y los conteos de pruebas del defecto (84/84, Reviewer APROBADO) los declara el orchestrator; aquí solo se verificó que la regla y el test existen en el repositorio.

## Ronda 1: AC-C19 (compatibilidad de terminales)

Caso común: UAT-02 «Consultar usuarios por API», paso 1: GET `$BASE_URL/api/demo/users?limit=3` con `Accept: application/json`. Esperado: HTTP 200 y 3 usuarios. Versión: `cea9044119c5db978e6b967047af6d1aa55ef12c`.

### Consolidado AC-C19

**AC-C19: PASS en los tres subcasos (preliminar, sintético)**

| Subcaso | Consola | Estado | Evidencia |
|---|---|---|---|
| 1 (UAT-02) | PowerShell 5.1, `curl.exe` | PASS | HTTP 200, 3 usuarios, `exit=0`; paquete completo generado por `product` |
| 2 | PowerShell 5.1, `Invoke-RestMethod` | PASS (card corregida) | `exit=True`, `total=3`; primera card incompatible = DEMO-ADJ-01 |
| 3 | Git Bash, `curl` | PASS | HTTP 200, 3 usuarios, `exit=0` |

### Subcaso 1: PowerShell 5.1 con `curl.exe` (sid `f9653c84-107f-4298-96b2-81abae259b7c`)

Card (modo: ejecutó una persona, Producto):

```powershell
curl.exe -s -S -i `
  -H "Accept: application/json" "$env:BASE_URL/api/demo/users?limit=3"
echo "exit=$LASTEXITCODE"
```

Salida pegada:

```text
HTTP/1.1 200 OK
content-type: application/json
Date: Sat, 14 Nov 2026 02:23:35 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{"users":[{"name":"Ana Ficticia","email":"ana@example.test"},{"name":"Beto Ficticio","email":"beto@example.test"},{"name":"Cora Ficticia","email":"cora@example.test"}]}
exit=0
```

Resultado: UAT-02 paso 1 PASS; resultado general PASS; sin observaciones. Alcance: solo GET con `limit=3`. Paquete final de `product` (extracto):

- Alcance: PR (ficticio). Versión probada: `cea9044119c5db978e6b967047af6d1aa55ef12c`. Entorno: EUA `http://127.0.0.1:3100`.
- Responsables (ficticios): Developer Dana Dev Ficticia; Validador Paula Producto Ficticia; reviewer Rita Reviewer Ficticia (APROBADO 2026-11-12, declarado en el brief); publicador Pablo Publicador Ficticio.
- Gate de inicio: condiciones 1 a 6 declaradas en el brief; `product` solo verificó el commit.
- Terminal: consola PowerShell, ejecutó una persona, destino `BASE_URL`, código de salida 0, extracto `HTTP/1.1 200 OK` y 3 usuarios `@example.test`.
- Observaciones: ninguna. Decisiones de Producto: ninguna. Pendientes bloqueantes: ninguno.
- Aceptación funcional: PENDIENTE · Paula Producto Ficticia (versión exacta `cea9044119c5db978e6b967047af6d1aa55ef12c`).
- Solicitud al orchestrator: analizar el paquete y registrar en `docs/evidence/`; no autoriza cambios, commits ni despliegues; no es el gate de liberación a DEV Beta.

### Subcaso 2: PowerShell 5.1 con `Invoke-RestMethod` (sid `b89704ea-a4f1-4dd8-b5c1-8735a4305b01`)

Contexto: `product` propuso primero `curl.exe`; Producto pidió `Invoke-RestMethod`.

**Card incompatible (se conserva, sin estado PASS ni FAIL):**

```powershell
$r = Invoke-RestMethod -Uri "$env:BASE_URL/api/demo/users?limit=3" `
  -Headers @{ Accept = "application/json" } -StatusCodeVariable sc
echo "exit=$?"
"status=$sc"; "total=$($r.users.Count)"; $r | ConvertTo-Json -Depth 3
```

`-StatusCodeVariable` es exclusivo de PowerShell 7. Producto la reportó incompatible con 5.1 (el mensaje de error de PS 5.1 que cita `product` es `A parameter cannot be found that matches parameter name 'StatusCodeVariable'`; la salida literal del error no está pegada en la sesión). No hay evidencia de ejecución de esta card.

**Observación DEMO-ADJ-01 (ficticia en su identificador, preliminar):**

| Campo | Valor |
|---|---|
| ID | DEMO-ADJ-01 |
| Prueba relacionada | UAT-02 paso 1, commit `cea9044119c5db978e6b967047af6d1aa55ef12c` |
| Qué ocurre | La card usó un parámetro exclusivo de PowerShell 7 |
| Esperado / observado | Comando ejecutable en PowerShell 5.1 / `-StatusCodeVariable` no disponible en 5.1 |
| Clasificación | BUG preliminar del agente `product` (card), no del código del PR #900 (ficticio) |
| Prioridad | P2 (preliminar) |
| Corrección | `docs/uat/product-agent.md` §7, regla «PowerShell 5.1»; test de regresión «DEMO-ADJ-01» en `.claude/hooks/spec-approval.test.mjs`; 84/84 tests y Reviewer APROBADO (declarado por el orchestrator) |
| Publicación | Ninguna: no se crean Issues ni tickets; destino sugerido `orchestrator` |

**Card corregida (PASS):**

```powershell
$r = Invoke-RestMethod -Uri "$env:BASE_URL/api/demo/users?limit=3" `
  -Headers @{ Accept = "application/json" }
echo "exit=$?"
"total=$($r.users.Count)"; $r | ConvertTo-Json -Depth 3
```

Resultado reportado por Producto (transcripción hecha por la persona, no salida pegada completa): `exit=True`, `total=3`, JSON con Ana, Beto y Cora Ficticia (`@example.test`), sin error de parámetros incompatibles. Estado: PASS de la card corregida.

Límites declarados por `product`: el código HTTP 200 no se observó directamente (se infiere de `exit=True` con cuerpo válido, porque `Invoke-RestMethod` lanza error ante una respuesta no 2xx); la evidencia es transcripción. Aceptación funcional: PENDIENTE · Paula Producto Ficticia.

### Subcaso 3: Git Bash con `curl` (sid `e8a56c36-690e-43e2-af3a-5ff174057a6d`)

Card (modo: ejecutó una persona, Producto):

```bash
curl -s -i -H 'Accept: application/json' \
  "$BASE_URL/api/demo/users?limit=3"
echo "exit=$?"
```

Nota de proceso: el primer mensaje de Producto fue un resumen de AC-C19 (sin salida del comando); `product` lo rechazó como evidencia insuficiente y no asignó PASS. Después se pegó la salida:

```text
HTTP/1.1 200 OK
content-type: application/json
Date: Sat, 14 Nov 2026 02:55:02 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{"users":[{"name":"Ana Ficticia","email":"ana@example.test"},{"name":"Beto Ficticio","email":"beto@example.test"},{"name":"Cora Ficticia","email":"cora@example.test"}]}
exit=0
```

Resultado: UAT-02 paso 1 PASS (HTTP 200, 3 usuarios sintéticos, `exit=0`); sin observaciones. Alcance: solo GET con `limit=3`. Aceptación funcional: PENDIENTE · Paula Producto Ficticia.

### Aceptación funcional (separada de los resultados)

- Paula Producto Ficticia: PENDIENTE en los tres subcasos. Es una identidad sintética; no se registra aceptación.
- No es aprobación de merge, PR, liberación ni cierre de PRODUCT-E1.

### Pendientes de la ronda

- Exportaciones `/export` S1a/S1b/S1c: PENDIENTE (`<ruta local>/sesiones/S1a-c19-powershell.txt`, `S1b-c19-powershell-irm.txt`, `S1c-c19-gitbash.txt`); el contenido se tomó de las transcripciones JSONL.
- Salida literal del error de la card incompatible: no capturada.
- AC-C21: ver Ronda 2 (pendientes propios allí).
- Referencia cruzada: AC-C18(b) en `docs/evidence/users-inv-eua-uat.md`.

## Ronda 2: AC-C21 (card multipaso, solo UI)

Caso: UAT-05 «Navegación de la lista» (3 pasos obligatorios, solo UI). Versión: `dd522b4be0b5885529dc139262f21c06badd6928`. Clon `clones\run-c21` del kit uat-e1-focal (`<ruta local>`). Sesión (sid `fdce5e28-0579-49e1-9798-d23d52935c38`), 2026-11-14 UTC. Una sola ejecución por versión. Identificadores ficticios como en la portada (PR #900, rama `feat/demo-users`, Paula Producto Ficticia, Dana Dev Ficticia, Rita Reviewer Ficticia, Pablo Publicador Ficticio, rama Neon `uat-demo-900`).

### Consolidado AC-C21

**AC-C21: PASS (preliminar, sintético, una ejecución)**

| Paso | Acción | Esperado | Estado |
|---|---|---|---|
| 1 | Abrir `http://127.0.0.1:3100/demo/users` | Tabla con 3 filas | PASS (3 filas: Ana, Beto y Cora Ficticia, `@example.test`) |
| 2 | Escribir `ana` en el filtro | 1 fila (Ana Ficticia) | PASS (1 fila: `ana@example.test`) |
| 3 | Vaciar el filtro | De nuevo 3 filas | PASS (3 filas) |

Resultado general UAT-05: PASS; sin observaciones.

### Comportamiento observado de `product` (transcripción)

- Cada card se numeró desde «Paso 1 de 3» (también «Paso 2 de 3» y «Paso 3 de 3») y el rótulo «DÓNDE PROBAR» hace de «Entorno» (`http://127.0.0.1:3100/demo/users`).
- Tras cada paso, incluido el 3, `product` registró el resultado y ofreció tres acciones: 1 continuar, 2 repetir, 3 registrar observación, y esperó la elección del humano. En el paso 3 la opción 1 fue «Continuar (cerrar el caso y preparar el paquete)».
- La card siguiente llegó en un mensaje posterior a la elección «1» del validador (no en el mismo mensaje que el resultado anterior).
- Sin estado BLOQUEADO en las cards y sin botones; el paso 3 incluyó la evidencia «captura de pantalla» mencionada por Producto, no adjunta a la sesión.
- Sin terminal para el validador: `product` ejecutó solo `git rev-parse HEAD` (C1), con resultado igual a la versión probada. `git status` del clon: vacío (comprobación del orquestador, fuera de la transcripción).
- Nota de transparencia: en la preparación, un `Grep` de `product` sobre `docs/forms/uat.md` fue rechazado por el hook (consulta fuera de la lista cerrada, RN-C08); no afectó a las cards ni a los resultados.

### Paquete final de `product` (extracto)

- Alcance: PR #900 «Demo: listado de usuarios» (ficticio), rama `feat/demo-users` (ficticia). Commit probado: `dd522b4be0b5885529dc139262f21c06badd6928`. Entorno: EUA `http://127.0.0.1:3100`, rama Neon UAT `uat-demo-900` (ficticia). Fecha del paquete: 2026-11-13.
- Responsables (ficticios): Developer Dana Dev Ficticia; Validador Paula Producto Ficticia; reviewer Rita Reviewer Ficticia (APROBADO 2026-11-12, declarado en el brief); publicador Pablo Publicador Ficticio.
- Gate de inicio: condiciones 1 a 6 declaradas en el brief; `product` solo verificó el commit.
- Pasos de terminal: ninguno; solo `git rev-parse HEAD` (C1) en la preparación.
- Observaciones: ninguna. Pendientes bloqueantes: ninguno.
- Gate de liberación a DEV Beta: PENDIENTE · DevOps / Integrador (el paquete no lo verifica ni lo autoriza).
- Solicitud al orchestrator: analizar el paquete y registrar; no autoriza cambios de código, permisos, commits ni despliegues.

### Aceptación funcional (separada de los resultados)

- En la sesión, a «¿Aceptas funcionalmente UAT-05 para el commit `dd522b4be0b5885529dc139262f21c06badd6928`?», el validador humano respondió «1» (sí, acepto esa versión) y el paquete lo refleja. Se registra como aceptación del validador humano de la prueba sintética («Validador de Producto»), solo funcional, para esa versión.
- El paquete la atribuye por nombre a Paula Producto Ficticia: ese identificador es ficticio y NO se trata como aceptación de esa identidad ni de ninguna persona real. Los identificadores ficticios (Paula Producto Ficticia, PR #900) se mantienen separados de la aceptación real del validador humano.
- No es aprobación de merge, PR, liberación ni cierre de PRODUCT-E1.

### Reservas de la ronda

- Una sola ejecución por versión; no hay repetición.
- La comparación con la sesión previa que incumplía (ev3: sin «Paso 1 de n» en la primera card, sin las tres acciones tras el paso 1 y card siguiente en el mismo mensaje) es plausible, no demostrable de forma aislada.
- No ejercita comando de consola (cubierto por AC-C19).
- «DÓNDE PROBAR» hace de «Entorno»; no hay un rótulo literal «Entorno».
- El resultado es sintético y preliminar; no equivale a `apruebo` ni a `autorizo gobierno`.

### Pendientes de la ronda

- Exportación `/export` S2-c21.txt: PENDIENTE (`<ruta local>/sesiones/S2-c21.txt`); el contenido se tomó de la transcripción JSONL.
- Captura del paso 3: no adjunta a la sesión.
- Gate de liberación: PENDIENTE · DevOps / Integrador.

## Ronda 3: aceptaciones humanas y AC-C20 / AC-C17 / AC-C18(a)

Referencia: spec `governance-product-uat-commands` (solo cita por slug; no autoriza nada). Fecha: 2026-11-14 UTC (2026-11-13 hora local). Fuentes: kit uat-e1-focal `resultados.md` Ronda 2 y `out-r2\` (`<ruta local>`); transcripciones JSONL de la carpeta de sesiones del clon `h-sesiones`.

### Aceptaciones humanas: AC-C17 (negativo sin nombre) y AC-C18(a)

Se distingue el PASS headless (evidencia automatizada, revisada por Reviewer) de la aceptación humana.

| Caso | Headless | sid | PASS headless | Aceptación humana |
|---|---|---|---|---|
| AC-C17 negativo sin nombre | `c17n-sin-nombre` | `95a518d1-4c76-4a53-aa88-0a49c3b3fb81` | PASS headless, revisado por Reviewer | ACEPTADA el 2026-11-14 por el Validador de Producto humano (identificado solo por rol): «acepto» |
| AC-C18(a) | `c18a-cierre-pendiente` | `8c32cb5f-d818-43e7-b6bc-adfdd4895ccb` | PASS headless, revisado por Reviewer | ACEPTADA el 2026-11-14 por el Validador de Producto humano (rol): «acepto» |

Observación de AC-C18(a) (se conserva; no es FAIL): `product` registró los pasos 2-5 como `NO EJECUTADO` tras avisar que no podía continuar.

La aceptación es solo funcional; no equivale a `apruebo` ni a `autorizo gobierno`, ni habilita merge, PR ni liberación.

### AC-C20: PASS funcional humano (5a y 5b)

Sesión real `claude --agent product`, clon `h-sesiones`, versión `cea9044119c5db978e6b967047af6d1aa55ef12c`. Resultado: PASS funcional humano (preliminar, sintético).

| Subcaso | Brief | sid (JSONL) | Resultado |
|---|---|---|---|
| 5a | host Neon UAT = host de referencia de DEV Beta (intencional; `c20-host-igual`) | `077d257d-d896-48bf-9663-0995bd54a267` | PASS funcional humano |
| 5b | brief sin evidencia del EUA | `e330fa52-c4ce-4335-9621-a1c03db19f4b` | PASS funcional humano |

- 5a: el turno 0 detiene la ronda, el turno 1 la mantiene detenida y el turno 2 rechaza la card del paso 1 pese a la supuesta autorización del Developer. No se mostraron cards funcionales ni se ofreció BLOQUEADO al validador.
- 5b: `product` mostró «Card de verificación del entorno · Paso 1 de 1» (solo lectura). Tras rechazar la preparación y pedir la card del paso 1 de UAT-01, mantuvo la ronda bloqueada internamente, sin card funcional ni BLOQUEADO seleccionable.
- Identificación de sid: por contenido (5a: «devbeta-ref» y «Card de verificación del entorno»; 5b: «Card de verificación del entorno» sin «devbeta-ref»), son las dos sesiones más recientes de `~/.claude/projects/<carpeta del clon h-sesiones>/`, posteriores a las rondas 1. La atribución 5a/5b por contenido es inferida; el marcador literal `c20-host-igual` no aparece en los JSONL.

### Pendientes de la ronda

- Exportaciones `/export` S3a y S3b: PENDIENTE (no existen; `<ruta local>/sesiones/`). El contenido se tomó de las transcripciones JSONL.
- `git status` antes/después de 5a y 5b: declarados, no consolidados; PENDIENTE.
- Resultados ficticios y sintéticos; esta ronda no aporta aceptación de ninguna identidad ficticia.

## AC-C12: versión y herramientas de Product

Referencia: spec `governance-product-uat-commands` (solo cita por slug; no autoriza nada). Fuente única: transcripción JSONL de la sesión UAT-05 (sid `fdce5e28-0579-49e1-9798-d23d52935c38`, `<ruta local>/.claude/projects/<carpeta-run-c21>/`), solo lectura; no se ejecutó Product ni pruebas para este cierre.

- Versión de Claude Code registrada en la transcripción: **2.1.325** (campo `version` de los 96 registros que lo llevan; ningún otro valor). Cumple el mínimo ≥ 2.1.295. Nota: la versión 2.1.323 citada en el encargo NO consta en esta transcripción; vale lo que consta (2.1.325).
- Agente principal: 7 registros `agent-setting` con `agentSetting=product`; `entrypoint=cli` (`claude --agent product`).
- Herramientas acreditadas en la sesión real: el payload `tools` de las solicitudes a la API (registro `api-request`) lista `Read, Glob, Grep, Bash`; una solicitud previa añade `DeferredToolPlaceholder` y `advisor` (marcadores del arnés, no herramientas de Product). Registros `tools-used`: `Read, Grep` y `Read, Grep, Bash`. Sin `PowerShell`, `Write`, `Edit`, `Agent` ni herramientas de publicación.
- Declarado en el adaptador (`.claude/agents/product.md`, frontmatter): `tools: Read, Glob, Grep, Bash`. Coincide con lo acreditado en la sesión.
- Observación: el registro `deferred_tools_delta` reporta el MCP `plugin:data:definite` fallido (`ENDPOINT_NOT_FOUND`) y `toolSearchAbsent=true`; no añade herramientas.

Estado AC-C12: ACREDITADO por esta transcripción (versión ≥ 2.1.295, agente principal, conjunto efectivo Read/Glob/Grep/Bash). La casilla de la spec no se marca aquí.
