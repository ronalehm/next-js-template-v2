# Registro UAT: users-inv-eua (UAT-01 / USERS-INV-EUA)

Formato: `docs/forms/uat.md` (secciones 5 y 6). Evidencia de AC-C18(b) de la spec `governance-product-uat-commands`. Alcance: preliminar (sin PR, merge ni liberación). Todos los resultados son provisionales.

## Portada

- Origen: cierre de la sesión real `claude --agent product`, sid `fd8cec35-d697-48aa-bc0f-ed4291f649c3` (transcripción en `~/.claude/projects/<carpeta-de-sesión-UAT>/`), Claude Code 2.1.323.
- Entorno: EUA real (`localhost:3001`, rama Neon `uat-users`, instancia de Clerk de desarrollo propia).
- Archivo origen: `real-close.md` (87 líneas), 2026-11-13 15:23. Incorporado aquí sin cambios de fondo; solo enmascarado de datos personales.
- `git-before.txt` es idéntico a `git-after.txt`.
- Versión probada: `2300e40+E1-wt-2026-11-13` (commit 2300e40 más cambios E1 sin commitear).

Reservas conocidas:

- Las capturas citadas en los pasos no están adjuntas.
- Los archivos no prueban quién tecleó los turnos; solo lo declara la nota de aceptación funcional.
- No se ejercitan pasos de terminal ni los otros 6 estados de ciclo de vida de `docs/forms/uat.md` §6.
- Faltan la ficha de 10 campos y el registro compacto de observaciones (no hubo observaciones).
- Este archivo no equivale a `apruebo` ni a `autorizo gobierno`, no habilita merge, PR ni liberación.

## Consolidado

**Consolidado UAT-01: PASS general (provisional)**

| Paso | Estado | Evidencia |
|---|---|---|
| 1. Lista de Usuarios | PASS | Capturas de la sesión UAT |
| 2. Invitar a una persona nueva | PASS | Captura: «Invitación enviada», rol Usuario, estado Invitado, 3 registros |
| 3. Invitación duplicada | PASS | Captura y texto exacto, diálogo abierto, 3 usuarios sin duplicados |
| 4. Cuenta que ya tiene acceso | PASS | Texto exacto, diálogo abierto, 3 usuarios sin duplicados |

No hay pasos pendientes ni observaciones formales.

## Paquete para el orchestrator

# Paquete UAT · USERS-INV-EUA

- Proyecto: Template V2 PRO
- Iniciativa: invitación de usuarios del panel
- Alcance: preliminar (sin PR). Resultados «provisional», sin PASS definitivo ni habilitación de merge.
- Rama: governance/product-uat-agent
- Versión probada: commit 2300e40 + cambios E1 sin commitear (identificador «2300e40+E1-wt-2026-11-13»)
- Entorno: EUA, http://localhost:3001, rama Neon uat-users, instancia de Clerk de desarrollo propia
- Revisión técnica E1: APROBADO (reviewer, ciclo 2 y correcciones C17/C21)

### Responsables
- Developer de la entrega E1: PENDIENTE · orchestrator (no consta en el registro de la entrega)
- Validador: Validador de Producto · Producto
- Publicador GitHub: PENDIENTE · orchestrator
- Publicador Linear: Developer responsable · Producto (proyecto Linear: <proyecto Linear>)
- Acceso al backlog verificado: PENDIENTE · Developer responsable

### Gate de inicio
- Excepción preliminar (sin PR).
- Condición 2: APROBADO por el reviewer.
- Condiciones 3 y 4: acreditadas por la evidencia del EUA, verificada el 2026-11-13 con uat-check.mjs.
- Nota: la comprobación de datos se hizo contra los dominios reservados RFC 2606, no solo contra @example.test como pide el contrato. Los correos de prueba usan example.com.

### Verificación de código (product, solo lectura, C1)
- Funcionalidad: invitación de usuarios · app/dashboard/users, modules/users (InviteUserDialog, UsersView, users.service) · commit 2300e40 · 2026-11-13
- Los mensajes de los pasos 3 y 4 coinciden con users.service.
- Los cambios sin commitear de E1 son de gobernanza y docs. Ninguno toca modules/users ni app/.

### Resultados
Caso UAT-01 (superadmin uat-superadmin+clerk_test@example.com): PASS general, provisional.
- Paso 1 · PASS · listado, columnas, botón «Invitar usuario» y superadmin activo. Capturas. Producto confirmó además la apertura del detalle y del formulario de invitación.
- Paso 2 · PASS · invitación a uat-nuevo+clerk_test@example.com: «Invitación enviada», rol Usuario, estado Invitado, 3 registros. Captura.
- Paso 3 · PASS · reinvitación: «Ya tiene una invitación pendiente. Usa Reenviar invitación.», diálogo abierto, sin «Invitación enviada», 3 usuarios sin duplicados. Captura.
- Paso 4 · PASS · invitación a uat-superadmin+clerk_test@example.com: «Esa persona ya tiene acceso.», diálogo abierto, sin «Invitación enviada», 3 usuarios sin duplicados. Evidencia en texto.

### Observaciones
- Ninguna formal (sin ID USERS-INV-EUA-ADJ-nn).
- Contexto, sin observación: queda un registro antiguo @example.test en estado Invitado, dato sintético residual de la preparación del EUA.
- Destino sugerido: no aplica.

### Decisiones de Producto
- Ninguna decisión sobre observaciones.
- Aceptación funcional de UAT-01: PENDIENTE · Validador de Producto (se declara abajo si la confirma).

### Datos de terminal
- Pasos de terminal guiados a Producto: ninguno (caso solo de interfaz).
- Comandos ejecutados por product (C1, consulta de solo lectura):
  - PowerShell o Git Bash: no aplica; lo ejecutó product mediante su herramienta Bash. Comando: git rev-parse HEAD · destino: repositorio local · extracto: 2300e4019c7d4f3a5e11cfe3fcc4a9834f5211fa · código de salida: no registrado.
  - Comando: git status --short · destino: repositorio local · extracto: 7 archivos modificados y 7 sin seguimiento, todos en .claude/, docs/, CLAUDE.md y archivos de apoyo · código de salida: no registrado.
- Pasos para reproducir: no aplica (sin observaciones de origen técnico).
- Tipo propuesto por Producto: no aplica.

### Pendientes
- Developer responsable de E1: PENDIENTE · orchestrator.
- Publicador GitHub: PENDIENTE · orchestrator.
- Acceso al backlog verificado: PENDIENTE · Developer responsable.
- Para pasar de preliminar a definitivo hace falta un PR y su commit exacto, revalidar y que Producto acepte sobre esa versión.
- Pendientes bloqueantes (P0 y defectos bloqueantes): ninguno.

### Solicitud al orchestrator
Analiza este paquete, clasifica el tipo de cambio si corresponde, determina la ruta, verifica las autorizaciones, coordina a los responsables y mantén la trazabilidad sin duplicados. Este paquete no autoriza cambios de código, permisos, commits ni despliegues. product no decidió la ruta ni asignó responsables. El paquete no verifica ni autoriza la liberación a DEV Beta; eso corresponde a DevOps / Integrador.

## Notas de cierre de la sesión

El código de salida de los dos comandos C1 no quedó registrado. Los ejecutó product con su herramienta, no en una consola del validador. Está declarado así en el paquete.

**Aceptación funcional.** La decide el Validador de Producto y debe nombrar la versión exacta. Frase propuesta: «Acepto funcionalmente UAT-01 en la versión 2300e40+E1-wt-2026-11-13 (provisional).» Esta aceptación es independiente de las aprobaciones SDD y de la liberación.

Cuando el validador responde, product actualiza la línea de aceptación del paquete. El bloque se pega en la sesión del `orchestrator`, que lo comprueba y encarga a un `developer` el registro en `docs/evidence/` (este archivo).

## Aceptación funcional
- 2026-11-13 · Validador de Producto · Producto: «ACEPTO FUNCIONALMENTE UAT-01 — AC-C18(b)». Alcance preliminar, versión 2300e40+E1-wt-2026-11-13. No es aprobación de merge, PR ni cierre de PRODUCT-E1. Pendientes: Developer responsable de E1, publicador GitHub y acceso al backlog.
