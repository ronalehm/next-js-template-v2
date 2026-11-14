# SETUP

Reglas de estructura, buenas prácticas y metodología de trabajo para proyectos basados en esta plantilla.

Stack: Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 · shadcn/ui (Base UI) · TanStack Query · TanStack Table · axios · zod · zustand.

---

## 1. Estructura de carpetas

### Reglas

1. **Modular por dominio.** Todo el código de negocio vive en `modules/<dominio>/`. Un dominio es un concepto del negocio (`users`, `orders`, `auth`), no un tipo técnico.
2. **`app/` solo enruta.** Las rutas del App Router (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`) son delgadas: leen params, componen componentes del módulo y nada más. Sin lógica de negocio, sin llamadas HTTP directas.
3. **Nombres en inglés** para carpetas, archivos, variables, funciones, tipos y componentes. El contenido visible al usuario puede estar en español.
4. **Cada módulo expone una API pública** mediante `index.ts`. Fuera del módulo se importa solo desde `@/modules/<dominio>`, nunca desde sus archivos internos.
5. **Un módulo no importa internals de otro módulo.** Si dos módulos necesitan lo mismo, se sube a `components/shared`, `hooks/` o `lib/`.
6. **Solo se crean las subcarpetas que el módulo necesita.** No se crean carpetas vacías "por si acaso".
7. **Server Components por defecto.** `"use client"` solo en componentes con estado, efectos, eventos o hooks de cliente (TanStack Query, zustand), y lo más abajo posible en el árbol.
8. **Imports con alias `@/`**, nunca rutas relativas que suban más de un nivel (`../../`).

### Estructura general

```
app/                          # App Router: solo rutas
  (public)/                   # route groups para agrupar sin afectar la URL
  (dashboard)/
    users/
      page.tsx
      [id]/page.tsx
  layout.tsx
  providers.tsx               # QueryClientProvider y otros providers de cliente
components/
  ui/                         # shadcn/ui (generado por el CLI)
  shared/                     # componentes reutilizables entre dominios
hooks/                        # hooks reutilizables entre dominios
lib/                          # utilidades globales: cliente axios, query client, utils
modules/
  <domain>/
    components/
    hooks/
    services/
    schemas/
    stores/
    types/
    utils/
    index.ts                  # API pública del módulo
docs/
  SETUP.md
  specs/                      # especificaciones SDD (ver sección 3)
```

### Convenciones de nombres

| Elemento | Convención | Ejemplo |
|---|---|---|
| Carpetas | kebab-case | `modules/purchase-orders/` |
| Componentes (archivo y nombre) | PascalCase | `UserTable.tsx` → `export function UserTable()` |
| Hooks | camelCase con prefijo `use` | `useUsers.ts` → `useUsers()` |
| Services | `<domain>.service.ts` | `users.service.ts` |
| Schemas zod | `<domain>.schema.ts` | `users.schema.ts` → `userSchema` |
| Stores zustand | `<domain>.store.ts` | `users.store.ts` → `useUsersStore` |
| Types | `<domain>.types.ts` | `users.types.ts` |
| Utils | camelCase | `formatUserName.ts` |
| Tests | mismo nombre + `.test` | `users.service.test.ts` |
| Tipos e interfaces | PascalCase, sin prefijo `I` | `User`, `CreateUserInput` |
| Constantes globales | UPPER_SNAKE_CASE | `MAX_PAGE_SIZE` |

Excepciones: los archivos especiales de Next.js (`page.tsx`, `layout.tsx`, `route.ts`…) y los segmentos de ruta en `app/` van en minúsculas/kebab-case. Los componentes de `components/ui/` mantienen el nombre que genera shadcn (`button.tsx`).

### Ejemplo: módulo `users`

```
modules/users/
  components/
    UserTable.tsx
    UserForm.tsx
  hooks/
    useUsers.ts
    useUsers.test.ts
  services/
    users.service.ts
    users.service.test.ts
  schemas/
    users.schema.ts
  types/
    users.types.ts
  index.ts
```

```ts
// modules/users/schemas/users.schema.ts
import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.email(),
});

export const createUserSchema = userSchema.omit({ id: true });
```

```ts
// modules/users/types/users.types.ts
import type { z } from "zod";
import type { createUserSchema, userSchema } from "../schemas/users.schema";

export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
```

```ts
// modules/users/services/users.service.ts
import { api } from "@/lib/api";
import { userSchema } from "../schemas/users.schema";
import type { CreateUserInput } from "../types/users.types";

export async function getUsers() {
  const { data } = await api.get("/users");
  return userSchema.array().parse(data);
}

export async function createUser(input: CreateUserInput) {
  const { data } = await api.post("/users", input);
  return userSchema.parse(data);
}
```

```ts
// modules/users/hooks/useUsers.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { getUsers } from "../services/users.service";

export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: getUsers });
}
```

```ts
// modules/users/index.ts — solo lo que otros necesitan
export { UserTable } from "./components/UserTable";
export { useUsers } from "./hooks/useUsers";
export type { User } from "./types/users.types";
```

```tsx
// app/(dashboard)/users/page.tsx — la ruta solo compone
import { UserTable } from "@/modules/users";

export default function UsersPage() {
  return <UserTable />;
}
```

### Responsabilidades por capa

| Capa | Hace | No hace |
|---|---|---|
| `app/` | Rutas, metadata, params, composición | Lógica de negocio, fetch directo |
| `components/` | Renderizar UI y emitir eventos | Llamar a axios directamente |
| `hooks/` | Conectar UI con datos/estado (TanStack Query, zustand) | Lógica de presentación |
| `services/` | Hablar con la API y validar respuestas con zod | Usar React o hooks |
| `schemas/` | Validar datos externos y formularios | Lógica de negocio |
| `stores/` | Estado global de cliente (UI, sesión, preferencias) | Guardar datos del servidor (eso es TanStack Query) |

---

## 2. Buenas prácticas

Se aplican **siempre**: en componentes (incluidos los de shadcn), funciones, hooks, services, stores y schemas.

### Antes de crear algo

1. **Buscar si ya existe** en el proyecto: `components/ui`, `components/shared`, `hooks/`, `lib/` y el módulo actual. Si existe algo parecido, reutilizarlo o extenderlo en vez de duplicarlo.
2. **Para componentes de UI, revisar primero shadcn/ui** (https://ui.shadcn.com). Si existe, instalarlo con `npx shadcn@latest add <component>`.
3. **Si no existe en shadcn**, crearlo nosotros componiendo primitivas de shadcn/Base UI, pensado para reutilizarse:
   - si lo usan varios dominios → `components/shared/`
   - si es de un solo dominio → `modules/<dominio>/components/`; se sube a `shared` cuando un segundo dominio lo necesite.

### SOLID

- **S (Responsabilidad única):** un componente renderiza, un hook gestiona datos, un service habla con la API. Si un archivo hace dos cosas, se divide.
- **O (Abierto/cerrado):** extender por props, `variants` (cva) o composición (`children`), no editando el componente para cada caso nuevo.
- **L (Sustitución de Liskov):** los componentes que envuelven elementos nativos o de shadcn aceptan y reenvían sus props (`...props`, `className`) para poder usarse en su lugar.
- **I (Segregación de interfaces):** props pequeñas y específicas. No pasar objetos enteros cuando el componente solo usa dos campos.
- **D (Inversión de dependencias):** la UI depende de hooks, no de axios. Los services usan el cliente compartido de `@/lib`, no instancias propias.

### DRY

- Un solo cliente axios (`lib/api.ts`) y un solo `QueryClient`.
- Los tipos se derivan de los schemas de zod (`z.infer`), no se escriben dos veces.
- Las query keys de cada dominio viven en un único lugar del módulo.
- Se abstrae a partir de la segunda repetición real, no antes.

### KISS

- La solución más simple que cumpla la spec.
- Preferir lo nativo (HTML, CSS, APIs de Next.js) antes que añadir librerías.
- Componentes cortos y legibles; si hace falta un comentario para entender el flujo, simplificar primero.

### YAGNI

- No crear props, parámetros, carpetas ni abstracciones "para el futuro".
- Solo se implementa lo que pide la spec actual.
- No se añaden dependencias sin una necesidad concreta.

### Reglas del stack

- **TanStack Query** para todo estado del servidor; **zustand** solo para estado de cliente.
- **zod** valida toda frontera de confianza: respuestas de API, formularios y variables de entorno.
- **Tailwind**: usar los tokens del tema (`bg-primary`, `text-muted-foreground`), no colores arbitrarios. Unir clases con `cn()` de `@/lib/utils`.
- **TypeScript strict**: sin `any`; usar `unknown` y validar con zod.

---

## 3. Metodología: SDD (Spec Driven Development)

La spec es la fuente de verdad: el código se escribe para cumplirla y la revisión se hace contra ella. No todo pedido necesita una spec: el orquestador decide el modo.

### Rutas de trabajo

ODD-LIGHT: desarrollo adaptativo orientado al resultado. Cambio pequeño y reversible, verificado por su resultado, sin spec. Se ejecuta con `Modo: build` y conserva todos los controles: si crece o toca un disparador, pasa a SDD.

| Ruta | Cuándo | Flujo |
|---|---|---|
| **READ-ONLY** | Consulta o diagnóstico sin cambios. | Responde el orquestador |
| **BUILD (ODD-LIGHT)** | Resultado claro sin decisiones de diseño, ≤ 3 archivos, un solo módulo/capa, sin cambios de contrato de API ni rutas nuevas, y ningún disparador de riesgo. Ej.: bug localizado, estilos, textos, añadir un componente shadcn, refactor pequeño. | Developer → Reviewer (contra la tarea y este documento) |
| **SDD-LITE** | Funcionalidad o módulo nuevo, ruta nueva con datos, varias capas o módulos, requisitos ambiguos o > 3 archivos. | Spec breve → aprobación → Developer(s) → Reviewer |
| **SDD-ADVANCED** | Cualquier disparador de riesgo, aunque sea una línea. | Spec con contratos, seguridad y recuperación → aprobación → Developer por fase → Reviewer |

**Disparadores de riesgo:** autenticación, sesión, autorización, roles y permisos; esquema de base de datos, migraciones y borrado de registros; credenciales, secretos, webhooks, pagos, datos personales o de salud; multi-tenant e integraciones externas; infraestructura, CI/CD, despliegue y dependencias críticas; hooks, agentes, `.claude/settings.json` y este documento.

Si un trabajo en BUILD crece más de lo previsto o toca un disparador, se detiene y pasa a SDD.

### Autorizaciones

| | Funcional | Técnica privilegiada |
|---|---|---|
| Comando en el chat | `apruebo docs/specs/<slug>.md` | `autorizo gobierno docs/specs/<slug>.md` |
| Autoriza | La `Fase actual` de la spec y las rutas de `## Archivos sensibles` | Editar las rutas de `## Cambios de gobierno`, solo en esa sesión, durante 2 horas |
| Nunca autoriza | Archivos de gobierno, aunque la spec los cite | Registros de aprobación ni rutas no listadas |
| Firma SSH del usuario | `docs/specs/<slug>.md.sig` sobre raíz, spec, hash y fase | `docs/specs/<slug>.md.gov.sig` sobre raíz, spec, hash, fase, sesión, rutas, operación y caducidad, con cabecera propia |
| Se invalida si | Cambia la spec, incluida `Fase actual`, se usa en otro checkout o termina el plan | Lo anterior, otra sesión, caducidad, una aprobación posterior o falta su firma |

- **Gobierno:** `.claude/` salvo `plans/`, `projects/` y `worktrees/`; `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `.mcp.json`, `docs/SETUP.md`.
- **Nunca editables por un agente:** `docs/specs/approvals.jsonl`, `~/.claude/spec-privileged.jsonl`, `~/.claude/spec-approval.key`, `.git/`.
- **Rutas sensibles:** `.env*` salvo `.env.example`, `.github/workflows/`, `db/`, `migrations/`, `prisma/`, `drizzle/`, `proxy.*`, `middleware.*`, `scripts/db-*`, `lib/roles*`, `lib/db*`, y cualquier archivo o carpeta con `auth` en su nombre bajo `app/`, `modules/`, `components/`, `hooks/` o `lib/`. También en otro checkout: la spec de esta sesión no los autoriza allí.
- Una spec con todas las tareas de `## Plan` marcadas deja de autorizar rutas protegidas. Desmarcar casillas de una spec aprobada se bloquea.
- **Confirmación externa:** el comando en el chat y su HMAC no prueban consentimiento humano: `claude -p` también los produce. Una aprobación solo vale con una firma SSH de la declaración de la spec, hecha por el usuario en su terminal con una clave protegida por frase o por llave de hardware, sin cargarla en `ssh-agent`:
  1. Una vez: `ssh-keygen -t ed25519 -f ~/.ssh/spec_approval`, y en `~/.claude/spec-allowed-signers` la línea `approver namespaces="spec-approval" <contenido de spec_approval.pub>`.
  2. Cada aprobación, tras `apruebo`, en Git Bash desde la raíz del repo, no en PowerShell: el comando exacto que imprime el hook. Usa `node.exe` (el alias `node` de Git Bash pasa por `winpty` y rompe la tubería), escribe la declaración en un archivo temporal, aborta si `node.exe` falla o la declaración sale vacía, firma solo ese archivo y reemplaza `docs/specs/<slug>.md.sig` solo si la firma verifica contra `~/.claude/spec-allowed-signers`. Si algo falla imprime `ERROR: firma no creada` y la `.sig` anterior queda intacta:

     ```bash
     s=$(mktemp) && echo {} | node.exe .claude/hooks/spec-approval.mjs statement docs/specs/<slug>.md > "$s" && test -s "$s" && cat "$s" && ssh-keygen -Y sign -f ~/.ssh/spec_approval -n spec-approval "$s" && ssh-keygen -Y verify -f ~/.claude/spec-allowed-signers -I approver -n spec-approval -s "$s.sig" < "$s" && mv "$s.sig" docs/specs/<slug>.md.sig && echo "Firma verificada: docs/specs/<slug>.md.sig" || echo "ERROR: firma no creada; docs/specs/<slug>.md.sig sin cambios" >&2; rm -f "$s" "$s.sig"
     ```
  3. Cada autorización de gobierno, tras `autorizo gobierno`, igual: el hook imprime el comando, que añade `gobierno <session_id>` a `statement` y escribe `docs/specs/<slug>.md.gov.sig`. Solo firma la solicitud de esa sesión. Muestra la declaración antes de firmar: comprueba que `sesion:` coincide con la de `/status` y revisa `rutas:` y `caduca:`. Hasta esa firma, `autorizo gobierno` solo registra una solicitud y no desbloquea nada; ejecutar `record` desde un script o una copia del hook tampoco.
- Ninguna aprobación de spec autoriza desplegar, borrar datos ni migrar producción: eso requiere una orden expresa.

**Riesgos residuales:** estos controles evitan desvíos de un agente; no aíslan frente a un proceso local con los mismos permisos.

- Bash y PowerShell pueden escribir en rutas protegidas. El hook no analiza comandos; `reviewer` lo detecta en el diff real.
- Un proceso del mismo usuario del sistema puede leer la clave HMAC y forjar registros.
- `UserPromptSubmit` también se dispara con `claude -p`, mensajes de otra sesión y tareas programadas, y nada identifica el origen; por eso se exige la firma externa.
- Un proceso del mismo usuario puede reemplazar `~/.claude/spec-allowed-signers` o el hook por shell. La firma impide falsificar consentimiento mientras esos archivos sigan íntegros; solo un archivo de administrador o una verificación en servidor lo garantizan.
- Los hooks de frontmatter no corren en una carpeta sin confianza aceptada, y `claude -p` no la pide. Los controles de gobierno viven en `.claude/settings.json`.
- Sin firma, una aprobación no desbloquea nada. `relay` y el `deny` sobre `claude` bloquean el comando literal, no un texto codificado ni un script que lance otra sesión.
- `relay` y el `deny` también bloquean ejecutar el modo `record` del hook desde la terminal. Es una defensa adicional, no el control: una copia con otro nombre o un comando codificado los evita, pero sin la firma del usuario la solicitud no desbloquea nada.
  Bloquea también comandos legítimos que mencionen ambos, como `grep record` sobre el hook: usar Grep o Read.
- La declaración de gobierno se firma tal como la imprime el hook. Si el agente cambiara el comando al transmitirlo, o un proceso con la clave HMAC añadiera una solicitud con otras rutas, el usuario lo vería al firmar: comparar `sesion:` con `/status` y revisar `rutas:` es su control.
- En una sesión de escritorio con worktree corre la copia del hook del checkout principal. Si esa copia ya incluye la comprobación de integridad y difiere de la del worktree, bloquea; una copia anterior no lo detecta.
- Sobre `docs/specs` los agentes usan Read/Grep/Glob, no Bash; sobre el hook, no `grep record`. Una lista de lectura Bash queda fuera de alcance (requeriría spec propia).
- **Hook desalineado entre checkouts:** `checkIntegrity()` bloquea. El usuario alinea el hook en todos los checkouts y reinicia la sesión. Rollback: revertir el commit del hook y re-firmar con `node.exe .claude/hooks/spec-approval.mjs statement <spec>`.
- **BUILD no evita una aprobación SDD:** si el trabajo toca disparadores, rutas protegidas o gobierno, se reclasifica a SDD. En `Modo: build` la spec se cita por slug, no por ruta, para evidencia UAT; citarla no la hace autorizadora.
- Mientras una spec con su plan abierto liste una ruta sensible, `Modo: build` puede editarla: el hook no conoce la tarea. `reviewer` lo revisa en el diff.
- Las únicas capas fuera del alcance del usuario local son `managed-settings.json`, protegido por administrador, y reglas del servidor Git.

### Planes alcanzables

- Cada fase de una spec tiene como máximo **5 tareas y ~15 archivos**, para que quepa en una sesión de desarrollo.
- Un pedido mayor se divide en fases, cada una entregable y funcional por sí misma. Se ejecuta una fase por sesión; el progreso queda en las casillas del plan de tareas de la spec.

### Ejecución en paralelo

- Cada tarea del plan declara los archivos que crea o modifica. Dos tareas se lanzan en paralelo solo si sus archivos son disjuntos y no dependen entre sí.
- Lo que toca archivos compartidos va primero y en secuencia: instalar dependencias o componentes shadcn, `package.json`, `app/layout.tsx`, `app/providers.tsx`, `lib/`, `components/ui/`, `components/shared/` y los `index.ts` de módulos.
- Todo developer, en paralelo o no, solo toca sus archivos, verifica con `vitest`/`eslint` sobre ellos (`npx vitest run <archivos>`, `npx eslint <archivos>`) y no ejecuta `npm run build` ni `npx vitest run` sin argumentos (dos builds simultáneos chocan en `.next/`). La verificación integral la ejecuta el reviewer una vez por revisión, según la tabla de su agente.
- Ningún agente ejecuta commit, push ni PR; un humano autorizado los realiza bajo su responsabilidad y el commit lo decide el usuario.

### Agentes

| Agente | Responsabilidad | Entrada | Salida |
|---|---|---|---|
| **Orquestador** | Recibe el pedido, decide la ruta, invoca a los demás agentes (en paralelo cuando el plan lo permite) y controla que cada fase se cierre antes de pasar a la siguiente. No escribe código ni specs. | Pedido del usuario | Clasificación, avance y resumen final |
| **Spec** | Convierte el pedido en una especificación clara y verificable. Revisa qué existe ya en el proyecto y en shadcn. | Tarea del orquestador | `docs/specs/<module>-<feature>.md` |
| **Developer** | Implementa exactamente lo que dice la spec, siguiendo las secciones 1 y 2 de este documento, y escribe los unit tests requeridos. | Spec aprobada | Código y tests que pasan |
| **Reviewer** | Verifica el código contra la spec y este documento. Aprueba o devuelve con observaciones concretas. No corrige el código él mismo. | Spec + cambios | Aprobado / lista de observaciones |
| **Product** | Agente principal (`claude --agent product`, solo Claude Code) para UAT funcional en modalidad ASISTIDA: verifica identificación y gate de inicio, guía una prueba por interacción, registra resultados y prepara el paquete de evidencias. Su `Bash` está acotado por el hook (solo consulta y diagnóstico de solo lectura; los pasos que ejecutan pruebas los ejecuta Producto o el Developer). No escribe, no lanza agentes ni publica en GitHub/Linear. Comportamiento, catálogo de comandos y reglas de consola: fuente única `docs/uat/product-agent.md` (no se copian aquí); la ejecución DIRECTA queda para una fase posterior y E1 no cumple la visión completa. | Brief del orquestador | Resultados, observaciones y paquete en el chat |

Definidos en `.claude/agents/` (`orchestrator.md`, `spec.md`, `developer.md`, `reviewer.md`, `product.md`).

**Uso:** iniciar Claude Code con el orquestador como agente principal y describirle la funcionalidad:

```sh
claude --agent orchestrator
```

El orquestador debe ser el hilo principal porque los subagentes no pueden invocar a otros subagentes. Spec, developer y reviewer también se pueden invocar sueltos desde una sesión normal (por ejemplo, "usa el agente reviewer sobre docs/specs/users-list.md").

### Flujo SDD

```
Usuario → Orquestador → Spec → [aprobación del usuario] → Developer(s) → Reviewer
                                                              ↑               │
                                                              └── cambios ────┘
```

1. **Pedido:** el usuario describe la funcionalidad al orquestador, que la clasifica como SDD-LITE o SDD-ADVANCED.
2. **Spec:** el agente Spec redacta la especificación con su plan de tareas.
3. **Aprobación humana (bloqueante):** el usuario revisa la spec y la aprueba escribiendo exactamente **"apruebo docs/specs/<slug>.md"** en el chat (ej. `apruebo docs/specs/users-list.md`). Un mensaje que parezca un intento de aprobar sin ese formato ("apruebo", "apruebo users-list", una ruta .md fuera de `docs/specs/`) se rechaza y se muestran las specs pendientes; otros mensajes ("apruebo pero cambia X") no aprueban nada. Un hook cambia entonces `Estado: borrador` → `Estado: aprobado` y registra la aprobación en `docs/specs/approvals.jsonl` (spec, huella del contenido, quién aprobó según `git config user.name/email`, fecha y firma). El developer no empieza sin ese estado, y el reviewer marca como bloqueante cualquier implementación sin él. Ningún agente puede aprobar una spec. Si la spec se modifica después de aprobada, su aprobación deja de valer: el gate la bloquea por hash y requiere una nueva.
   - **Bloqueo técnico** (`.claude/settings.json` → `.claude/hooks/spec-approval.mjs`):
     - `UserPromptSubmit`: registra la aprobación. Ver riesgos residuales sobre el origen del mensaje.
     - `relay`: las herramientas no pueden enviar el comando literal de aprobación.
     - Tras una aprobación válida, el hook indica a Claude que continúe de inmediato con la implementación siguiendo el flujo del orquestador (developer según el plan y después reviewer), sin volver a pedir confirmación.
     - **Developer** (`guard` y `relay` por `agent_type`, también sin confianza de carpeta): `docs/specs/` es de solo lectura para él; se bloquea cualquier escritura ahí y cualquier comando de terminal que mencione `docs/specs`.
     - `PreToolUse` (Write/Edit/NotebookEdit): aplica la tabla de autorizaciones por archivo real, en cualquier agente y en el hilo principal. Además, Claude solo puede crear o editar specs con `Estado: borrador`; escribir `aprobado` o quitar la línea `Estado:` se bloquea.
     - `PreToolUse`: antes de lanzar un agente que implementa, exige que cada spec citada tenga una aprobación registrada, que su contenido no haya cambiado (marcar casillas sí se permite) y que el prompt declare `Fase: <fase actual>`. `developer` sin spec solo se lanza con `Modo: build`, que no autoriza rutas protegidas.
     - **Fallo del hook:** `onFailure: block` impide que un `PreToolUse` roto deje pasar la acción. Si bloquea por error, el usuario corrige `.claude/settings.json` a mano.
     - **Firma:** cada aprobación se firma (HMAC) con una clave por equipo en `~/.claude/spec-approval.key`, fuera del repositorio, que se crea con la primera aprobación. Las líneas del registro sin firma válida se ignoran, así que un agente no puede falsificar una aprobación editando `approvals.jsonl`. `.claude/settings.json` impide a Claude leer la clave y editar el registro con sus herramientas.
     - **Otra máquina u otro checkout:** la firma incluye la raíz del repositorio. Una spec aprobada en otro equipo, worktree o tras integrarse en otra rama debe volver a aprobarse allí.
     - Tests: `npx vitest run .claude/hooks`.
   - El usuario puede editar código y módulos directamente; el flujo y los bloqueos aplican a los agentes.
4. **Implementación:** uno o varios Developers (en paralelo cuando el plan lo permite) implementan las tareas y sus tests.
5. **Revisión:** el Reviewer valida contra la spec. Si hay observaciones bloqueantes, vuelven al Developer y se revisa de nuevo (máximo 3 ciclos; después se consulta al usuario).
6. **Cierre:** tras el APROBADO del reviewer con evidencia por AC, el orquestador marca las tareas del plan y los AC cumplidos; marcar no invalida la aprobación y desmarcar está bloqueado. Si quedan fases, se continúan en otra sesión.

Si durante la implementación la spec resulta incompleta o incorrecta, se actualiza la spec primero y luego el código, nunca al revés.

### UAT y cambios solicitados

Fuente única de las reglas UAT para cualquier `<INICIATIVA>`. Cita «Rutas de trabajo», «Autorizaciones» y «Flujo SDD» sin copiarlas. `docs/forms/uat.md` es formato operativo (campos y checklists, no reglas), no gobierno ni instrucción de agente: no se rige por D9 por sí mismo ni exige autorización de gobierno, coherente con las categorías D7/D9 de `docs/specs/template-v2-odd-sdd-optimization.md` (se reclasifica por D7 si llegara a contener reglas). Las sesiones abiertas deben reiniciarse para cargar estos cambios.

**Clasificación segura.** Antes de elegir ruta se verifican todos los requisitos de «Rutas de trabajo» (archivos, módulo/capa, contratos, rutas protegidas, decisiones firmadas, seguridad, permisos, disparadores). Ni el tipo ni el tamaño aparente determinan la ruta ni la autorización; con incertidumbre, detenerse y solicitar evaluación.

| Tipo | Siguiente paso |
|---|---|
| BUG, VISUAL, UX, FUNCTIONAL CHANGE, TECHNICAL/CRITICAL | Verificación previa; la ruta sale de ella, no del tipo |

- Una spec cerrada (todas sus casillas marcadas) no autoriza rutas protegidas («Autorizaciones»).
- Un cambio que contradiga una decisión firmada exige una spec adicional que la referencie y sustituya, sin editar la firmada («Flujo SDD»).

**Pruebas y observaciones.**

- Cada prueba se guía de a una, con ficha de 10 campos de `docs/forms/uat.md`, basada en código, rutas y textos reales; no se inventan botones, rutas ni comportamientos.
- El usuario comunica libremente; el Orchestrator traduce a una ficha técnica READ-ONLY de 10 campos y recomienda; el usuario no elige ODD/SDD.
- Decisiones del usuario sobre una observación: incluir en este ciclo, posponer al backlog, rechazar, solicitar reformulación. No usan «apruebo» ni «aprobar»: `apruebo docs/specs/<slug>.md` solo significa aprobación de spec. Una observación no es un cambio autorizado.
- Una mejora opcional no bloquea el cierre; un defecto crítico de seguridad, permisos, aislamiento o integridad de datos bloquea la aceptación correspondiente.
- La criticidad liga urgencia y bloqueo (crítica: inmediata y bloquea la aceptación afectada; funcional: según impacto; mejora opcional: backlog) y no determina la ruta ni autoriza `Modo: build`.
- ID al registrar: `<INICIATIVA>-ADJ-nn`; la clasificación es un atributo y no renombra el ID.
- Tras una corrección se repiten solo las pruebas afectadas y las regresiones necesarias, justificando el alcance. Los ciclos usan el bucle y tope vigentes («Flujo SDD», paso 5).

**Responsabilidades.**

| Rol | Responsabilidad en UAT |
|---|---|
| Producto | Ejecutar UAT, registrar observaciones, definir la criticidad funcional, decidir su tratamiento y aceptar o rechazar la funcionalidad |
| Developers | Implementar funcionalidades, evaluar la complejidad técnica, realizar correcciones autorizadas y apoyar el registro de evidencias |
| DevOps / Integrador | Coordinar PR, integración y liberación autorizada a DEV Beta, verificando los controles previos del «Gate de liberación a DEV Beta» |

`orchestrator`, `developer`, `reviewer` y `product` son herramientas, no roles. El `orchestrator` clasifica y coordina (ruta, asignaciones, autorizaciones, revalidaciones) y no escribe código ni archivos (solo casillas); el agente `developer` escribe el registro UAT en `Modo: build`; el `reviewer` ejecuta las verificaciones técnicas y de regresión y no edita archivos, y su APROBADO no es aceptación funcional; `product` es un agente principal sin escritura y con `Bash` acotado por el hook (`claude --agent product`, solo Claude Code) que guía la UAT, no diagnostica, no corrige y no publica. El trabajo escalado sigue el flujo SDD con spec y aprobación. Los ajustes menores los resuelve el equipo interno + Claude Code solo cuando el gobierno vigente (ruta y autorización) lo autorice, sin rodear rutas protegidas.

**Criticidad frente a complejidad.** Son conceptos separados y ninguno fija la ruta BUILD o SDD (la fija «Clasificación segura»). Criticidad funcional, la decide Producto (el agente asiste) y va en «Prioridad»: P0 crítica (seguridad, permisos, pérdida de datos o integridad); P1 alta (impide un flujo esencial); P2 media (problema funcional secundario o UX relevante); P3 baja (detalle visual o mejora menor). Complejidad técnica (Baja, Media, Alta): la evalúa Desarrollo, no `product`; va como metadato `Complejidad: <ID> · Baja|Media|Alta · evaluada por <nombre> (Developer)` asociado al ID, nunca en «Clasificación» (que solo contiene el tipo). Un P0 se escala de inmediato y bloquea la exposición de la funcionalidad afectada a usuarios beta hasta resolverse; los defectos bloqueantes de flujos esenciales (P1) se resuelven antes de habilitarla; los pendientes no bloqueantes solo se posponen con autorización expresa de Producto, documentados y asignados.

**Resultados mostrados y estados internos.** La card ofrece estos resultados y nunca BLOQUEADO; el agente decide el estado interno según la causa que describe Producto:

| Resultado mostrado | Estado interno (`docs/forms/uat.md`) |
|---|---|
| PASS | PASS |
| NO PASS | FAIL |
| PASS CON OBSERVACIONES | PASS CON OBSERVACIÓN |
| NO EJECUTADO / No pude probar | BLOQUEADO si un defecto, dependencia o el entorno lo impide; NO EJECUTADO si no se intentó (tiempo, decisión o alcance) |

Todo paso es obligatorio salvo que el brief lo marque como opcional. Precedencia del resultado general, sobre los estados internos: (1) algún paso obligatorio, u opcional ejecutado, NO PASS → NO PASS; (2) si no, algún paso obligatorio BLOQUEADO → BLOQUEADO; (3) si no, algún paso obligatorio NO EJECUTADO → NO EJECUTADO; (4) si no, algún paso PASS CON OBSERVACIONES → PASS CON OBSERVACIONES; (5) si no → PASS. Un paso obligatorio NO EJECUTADO o BLOQUEADO nunca produce PASS ni PASS CON OBSERVACIONES general; un opcional no ejecutado no cambia el general pero se informa.

**Destino de observaciones y backlog compartido.** El backlog UAT es único desde el punto de vista operativo: vive en los PR de GitHub y en Linear (el proyecto de Linear indicado en el brief; no se crea otro) y Producto y Developers lo consultan. El acceso de ambos roles se comprueba con cuentas reales antes del primer uso y el brief lo declara; sin confirmación, las observaciones quedan como `PUBLICACIÓN PENDIENTE` y no se dan por registradas, aunque se documenten en `docs/evidence/<slug>-uat.md` (que se conserva siempre). `product` valida y prepara el contenido; publica una persona o proceso expresamente autorizado, identificado en el brief: en GitHub, el Developer humano asignado o un DevOps / Integrador autorizado; en Linear, Producto o quien administra el backlog. Antes de publicar, ese responsable verifica en GitHub y Linear que no exista un registro relacionado (sin duplicados). Orden de destino: (1) si corresponde al PR actual, comentario en su hilo (ID UAT, descripción, esperado, observado, criticidad, Developer responsable); (2) si corresponde a un ticket de Linear existente, se actualiza y se sigue allí (ID UAT, descripción, criticidad, decisión de Producto, enlace a la evidencia); (3) solo si es independiente y no hay registro relacionado, Issue nuevo en Linear (responsable, prioridad, descripción, referencia de la prueba, enlace a la evidencia). No se crea un Issue por cada observación menor resuelta en el PR. El registro guarda el enlace en «Implementación (PR y/o ticket)», no una copia del hilo. Los pospuestos con seguimiento posterior al PR se vinculan a un ticket activo (se reutiliza el relacionado; si está cerrado, se reabre o se crea uno enlazado), con enlaces cruzados ticket ↔ hilo del PR ↔ registro.

El campo «responsable/asignado» vive en el registro UAT. Una persona puede ejercer dos capacidades, que pueden coexistir (Producto y Diseño, con las autorizaciones y permisos correspondientes). **Validador funcional:** prueba funcionalidades, reporta y acepta resultados funcionales; no diagnostica código. **Colaborador de código:** conoce programación asistida por IA; puede preparar correcciones menores en una rama independiente y proponer un PR para revisión técnica; no puede autoaprobar su cambio como único revisor. Es una capacidad adicional y explícitamente autorizada de la persona, no del rol de validación.

**Entorno.** El equipo técnico deja la copia local con cuentas, credenciales y datos de prueba aislados. Se verifica una vez al iniciar la ronda y se repite si cambian configuración, credenciales, conexión, roles, sesión o versión del código. Operaciones sensibles o destructivas: controles adicionales, autorización explícita del propietario y solo datos de prueba. No se exigen comandos técnicos al usuario funcional.

**Bloqueos.** Ante FAIL o BLOQUEADO:

1. Registrar el comportamiento observado.
2. Evaluar si es riesgo crítico (bloqueo crítico, seguridad o integridad): solo entonces análisis inmediato y, si lo exige, se detiene la ronda.
3. Suspender solo los casos dependientes: pruebas cuyo campo «depende de» nombra la fallida o bloqueada, o que no pueden ejecutarse con seguridad sin su resultado.
4. Continuar con las pruebas independientes si es seguro.
5. Asignar la investigación técnica al responsable adecuado.

**Trazabilidad y aceptación.**

- Registro por iniciativa en `docs/evidence/<slug>-uat.md` (documentación informativa, categoría D7), escrito por un `developer` en `Modo: build` en checkpoints (pausa, cierre de ronda, antes de un PR); el Orchestrator no escribe archivos.
- Cada observación conserva 12 campos y los estados de resultado y de ciclo de vida de `docs/forms/uat.md`; el campo «implementación» anota PR y/o ticket.
- Las pruebas automatizadas y las manuales se separan: un PASS manual no se concede por resultados automatizados ni por afirmación genérica, e identifica qué validó el usuario.
- Un BLOQUEADO o FAIL posterior no se sobrescribe con un PASS anterior sin una aclaración registrada.
- Los lotes agrupan observaciones compatibles sin mezclar rutas de autorización distintas.

**Aceptación UAT ≠ autorización.** La aceptación UAT no equivale a `apruebo docs/specs/<slug>.md` ni a `autorizo gobierno docs/specs/<slug>.md`, ni reutiliza aprobaciones agotadas o vencidas. Se mantienen sin cambios aprobación por fase, autorización de gobierno, firmas SSH, hooks, settings, `Modo: build` sin autorizar rutas protegidas y la separación Orchestrator/Developer/Reviewer. El Orchestrator entrega el comando exacto de aprobación o autorización y de firma, listo para copiar; lo ejecuta quien autoriza, no el usuario funcional durante una prueba.

**UAT-LIGHT (por defecto).** Recorta lecturas, agentes y verbosidad; nunca pruebas ni controles. Formato en `docs/forms/uat.md`.

- 8.1 Instrucciones breves y secuenciales, una prueba por interacción (pantalla, pasos, esperado, recuperación); resultados «prueba · esperado · observado · estado · siguiente acción».
- 8.2 Registro mínimo y compacto, con checkpoints al pausar, cerrar la ronda o preparar un PR.
- 8.3 Observaciones por lotes compatibles, sin agentes ni análisis profundo por comentario; la clasificación preliminar es provisional y no habilita ruta ni implementación.
- 8.4 Análisis de impacto agrupado, una vez al cierre de la ronda, salvo bloqueo crítico, seguridad o integridad (inmediato). La ficha técnica extensa solo cuando haga falta para implementar, escalar o auditar.
- 8.5 Reutilización: la verificación de código, rutas y textos se hace una vez al iniciar la ronda, por funcionalidad y versión, y se reutiliza en las pruebas relacionadas sin explorar de nuevo el repositorio. El registro anota funcionalidad, rutas y commit verificados (fecha o id de versión si es preliminar). Se repite si cambia el código relevante, el contexto, ante incertidumbre (revalidar por defecto) o si la prueba toca algo no verificado.
- 8.6 La ruta real, el alcance, las restricciones, el procedimiento y las autorizaciones se verifican antes de implementar; la ruta nunca sale de la etiqueta preliminar.
- 8.7 Escalado al procedimiento completo solo ante un disparador de riesgo, un cambio que contradiga una decisión firmada, una ruta protegida o de gobierno, o incertidumbre.
- 8.8 Límite duro: se mantienen los controles obligatorios (Reviewer, autorizaciones, firmas SSH, hooks); revisión y regresión proporcionales al riesgo; no se reducen las pruebas de seguridad, integridad ni aislamiento ni las verificaciones obligatorias del reviewer.

**Gate de inicio de pruebas.** Flujo estándar: Developer → Reviewer técnico → PR listo para UAT → Usuario funcional → Correcciones autorizadas → Revisión y revalidación → Merge. El gate se sitúa entre el APROBADO del reviewer técnico y el merge. Una ronda sobre un PR inicia solo con estas condiciones cumplidas y registradas (bloque «Gate de inicio de ronda» del registro):

1. Existe un PR identificable, con rama y commit exacto.
2. Las verificaciones técnicas obligatorias previas a UAT están aprobadas (APROBADO del reviewer; no es la aceptación funcional).
3. El equipo preparó una copia local o entorno de pruebas del commit del PR.
4. Las cuentas y bases de datos de prueba están aisladas de producción.
5. El Orchestrator dispone del alcance funcional y de los casos UAT que debe guiar.
6. El usuario funcional recibe instrucciones sencillas, sin operar Git ni ejecutar procesos técnicos.

- **Durante UAT:** observaciones ligeras; clasificación y asignación por «Clasificación segura» y «Responsabilidades»; se permiten correcciones autorizadas dentro del PR solo si la ruta y la autorización vigentes lo permiten; lo que contradice una decisión firmada o toca rutas protegidas sigue su spec adicional.
- **Trazabilidad por commit:** con PR, cada resultado lleva el commit exacto probado y su PASS queda ligado a él. Ante un commit nuevo se evalúa el impacto (archivos y áreas tocados, regresiones) y se registra, por cada PASS previo, «afectada → revalidar» o «ajena → PASS vigente» con justificación. Ante duda se revalida; seguridad, integridad, aislamiento y permisos se revalidan siempre que el cambio toque su área. Un PASS con alcance PR sin commit, o sobre un commit nuevo sin evaluación registrada, no es válido. El reporte de ronda indica el commit.
- **Quién crea qué:** solo el humano autorizado (el propietario o el equipo humano) realiza commits, push y apertura de PR, incluidos los de corrección; el Orchestrator solo exige y registra el commit exacto. Toda corrección autorizada es un commit nuevo, repite la verificación técnica proporcional del reviewer y la revalidación de lo afectado.
- **Merge:** solo tras cumplir los requisitos técnicos, las autorizaciones y la aceptación funcional aplicables; no se exige aceptación funcional si el gate se declaró «UAT no aplicable». El merge no equivale a liberar a DEV Beta («Gate de liberación a DEV Beta»). El cierre del orquestador y el APROBADO del reviewer técnico no sustituyen la aceptación funcional.
- **Conciliaciones:** la condición 2 no se rebaja por UAT-LIGHT (8.8). Las condiciones 3 y 4 siguen la regla de entorno, con «versión del código» = commit del PR.
- **Excepción preliminar:** antes del PR, en entorno aislado, cuando el equipo prepara expresamente una versión de prueba. Es provisional, se registra y se marca «alcance: preliminar» en registro y reporte, admite fecha o id de versión en lugar del commit, no marca PASS definitivo, no habilita merge y no sustituye el gate del PR cuando sea obligatorio.

**Obligatoriedad y «UAT no aplicable».** La revisión técnica y la UAT funcional son controles distintos: los disparadores de riesgo determinan la ruta y la verificación técnica, no fuerzan una prueba humana. El gate es obligatorio por impacto funcional: el PR modifica comportamiento visible, flujos funcionales, reglas de negocio, permisos, autorización o tratamiento de datos que afecten al usuario. «UAT no aplicable» es un resultado del gate para un PR solo de documentación, instrucciones de agentes, gobierno o herramientas sin impacto funcional visible; exige justificación registrada y las verificaciones técnicas completas (condiciones 1 y 2 y las que la tabla del reviewer exija a su categoría; las condiciones 3 a 6 no aplican) y nunca omite controles técnicos, de seguridad, de aprobación ni de gobierno. Está prohibido declararlo si el PR cambia comportamiento funcional observable, permisos de la aplicación, autenticación, autorización, reglas de negocio, datos personales o esquema con efecto en el usuario; ante duda, el gate es obligatorio. Los permisos de agentes y hooks de gobierno no son «permisos de la aplicación».

**Gate de liberación a DEV Beta.** SETUP es la fuente normativa; `product.md` y `orchestrator.md` lo citan sin copiarlo. DEV Beta es un ambiente compartido con usuarios reales y no es desechable. Este gate es distinto del «Gate de inicio de pruebas» (que autoriza empezar una ronda): lo verifica **DevOps / Integrador** antes de exponer una funcionalidad con impacto funcional a usuarios reales de DEV Beta, y la aceptación funcional la da Producto. `product` no verifica ni autoriza la liberación: su paquete solo declara la aceptación (sí/no, versión exacta) y los pendientes bloqueantes. No define un proceso de liberación a producción ni implementa ni modifica CI/CD.

Regla de liberación: «No habilitar una funcionalidad con impacto funcional para usuarios reales de DEV Beta sin aceptación previa de Producto.»

Flujo:

1. **Developer implementa** en una rama o worktree independiente, respetando el alcance y las autorizaciones SDD.
2. **Reviewer verifica:** pruebas técnicas y revisión de los cambios.
3. **Producto ejecuta UAT** sobre la versión candidata, en un entorno controlado con cuentas y datos de prueba aislados.
4. **Se documentan las observaciones:** `product` prepara los resultados y las incidencias.
5. **Se registran las incidencias** en el PR de GitHub o en Linear según «Destino de observaciones», conservando el registro formal UAT.
6. **Developers corrigen** solo los ajustes autorizados, por la ruta que corresponda.
7. **Reviewer verifica nuevamente** las correcciones y las pruebas de regresión.
8. **Producto revalida y acepta** que los criterios funcionales se cumplen en la versión evaluada.
9. **DevOps libera a DEV Beta** tras verificar el gate, las autorizaciones vigentes y la correspondencia entre la versión aceptada y la que se habilita.

Condiciones obligatorias (las verifica DevOps / Integrador):

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

Regla sobre merge y momento de verificación: «El merge no constituye por sí mismo autorización de liberación. Si provoca una exposición automática a usuarios beta, DevOps verifica el gate antes del merge; si la exposición es independiente, antes de desplegar o habilitar.» Si cambió el código tras la aceptación, DevOps evalúa el impacto y revalida lo afectado. La aceptación UAT no sustituye las aprobaciones SDD, las firmas SSH ni las autorizaciones de integración o despliegue. Un registro con controles obligatorios pendientes (`PENDIENTE · <responsable>`) no es completo para cierre y no cumple el gate; una referencia en `PUBLICACIÓN PENDIENTE` no cumple la condición 6.

**Seguridad de DEV Beta y minimización de datos.** No se ejecutan UAT destructivas sobre datos reales de usuarios beta; se usan cuentas y datos de prueba aislados; no se cambian permisos ni información de usuarios reales sin autorización específica; no se usan funcionalidades no aprobadas con usuarios reales. Un DEV Beta con usuarios reales cuenta como entorno real para la condición 4 del gate de inicio («cuentas y bases aisladas de producción»). Si el aislamiento es insuficiente, `product` detiene la ronda sin improvisar, registra BLOQUEADO y pide la preparación al responsable técnico. Las evidencias (paquete, comentarios de PR, tickets y registro) nunca incluyen secretos (contraseñas, tokens, claves, cookies, URLs con credenciales) ni datos personales de usuarios reales sin enmascarar o anonimizar (p. ej. `u***@dominio`); se registra solo lo necesario para reproducir; `product` no pide credenciales y, si las recibe, no las repite y pide retirarlas. Los nombres y roles de Developer, validador y publicador son datos de trabajo y no se anonimizan.

**Colaboración por PR.** Desarrollo publica un PR técnicamente preparado y Producto/Diseño ejecuta UAT. Un defecto del PR original se comenta en ese PR y se coordina allí. Una mejora menor independiente puede prepararla Producto/Diseño en su propia rama y PR; si depende de código aún no integrado, el equipo coordina la rama base y evita PR conflictivos contra `main`. Frontend/Backend revisa técnicamente esas contribuciones; Reviewer, CI y aceptación funcional se aplican según corresponda, siempre bajo «Clasificación segura» y con rutas protegidas y decisiones firmadas sujetas a su spec y aprobación. **Linear:** mejoras planificadas, bugs pendientes, cambios de alcance independiente, priorización, responsables y seguimiento. **GitHub:** código, comentarios de revisión, PR, evidencias técnicas y verificaciones. No se crea un ticket por cada observación menor dentro de un PR; se vincula ticket y PR cuando corresponda, sin duplicar registros.

**Colaboradores humanos.** La restricción de commit, push y PR es a agentes, no a personas («Ejecución en paralelo»). La autorización de un colaborador la concede el propietario en los permisos del repositorio remoto, sin registro nuevo en el repo. Se mantienen ramas protegidas, revisión técnica independiente (el autor no es su único revisor), ningún push directo a `main`, gates ODD/SDD, aprobaciones y firmas. Limitación: la aplicación de ramas protegidas depende del servidor Git y la aprobación de specs es por máquina e identidad con un único aprobador; por eso los colaboradores contribuyen solo por rutas que el gobierno ya permite, y toda ruta SDD, protegida o de gobierno sigue exigiendo `apruebo`/`autorizo gobierno` y las firmas del propietario. Multi-aprobador y verificación en servidor son una fase separada, con spec propia.

### Plantilla de spec

`docs/specs/<module>-<feature>.md`:

```md
# <Feature>

- Módulo: <domain>
- Estado: borrador | aprobado
- Fase actual: <fase> (si tiene fases)

## Objetivo
Qué problema resuelve y para quién.

## Alcance
- Incluye: ...
- No incluye: ...

## Requisitos
1. ...

## Criterios de aceptación
- [ ] Dado ..., cuando ..., entonces ...

## Diseño técnico
- Rutas (app/): ...
- Componentes (shadcn existentes / nuevos): ...
- Hooks, services, schemas, stores: ...
- Contrato de API (request/response): ...

## Reutilización
Qué ya existe en el proyecto o en shadcn y se va a usar.

## Archivos sensibles
(solo si aplica, para la fase actual)
- `ruta/exacta.ts`

## Cambios de gobierno
(solo si aplica, para la fase actual; requiere además autorización privilegiada)
- `.claude/ruta/exacta`

## Tests
Qué unidades requieren unit tests y qué casos cubren.

## Plan de tareas
### Fase 1
- [ ] T1 — <tarea> · archivos: ... · depende de: — · secuencial (base)
- [ ] T2 — <tarea> · archivos: ... · depende de: T1 · paralelo
- [ ] T3 — <tarea> · archivos: ... · depende de: T1 · paralelo

## Preguntas abiertas
(solo si hay)
```

Para SDD-ADVANCED, usar además `docs/templates/spec-advanced.md`.

### Checklist del Reviewer

- [ ] La spec tiene `Estado: aprobado` (solo SDD) y el trabajo corresponde a su `Fase actual`.
- [ ] Ningún archivo de gobierno ni ruta sensible cambió sin su autorización, también por Bash; BUILD no toca rutas protegidas.
- [ ] Cumple todos los criterios de aceptación de la spec.
- [ ] No implementa nada fuera del alcance de la spec; los archivos cambiados coinciden con el plan de tareas.
- [ ] Respeta la estructura modular y las convenciones de nombres.
- [ ] No duplica componentes, hooks o funciones existentes; usa shadcn cuando corresponde.
- [ ] Aplica SOLID, DRY, KISS y YAGNI.
- [ ] `"use client"` solo donde hace falta.
- [ ] Tests requeridos presentes y pasando; `npm run lint` y `npm run build` sin errores.

### Unit testing

Los tests se ubican junto al archivo que prueban (`users.service.ts` → `users.service.test.ts`).

**Requieren unit tests:**
- services (con la API mockeada)
- hooks con lógica propia
- utils y funciones con lógica de negocio
- stores de zustand
- schemas de zod con reglas no triviales (refinements, transformaciones)
- componentes reutilizables de `components/shared/` con comportamiento (estados, eventos)

**No requieren unit tests:**
- componentes de `components/ui/` generados por shadcn
- páginas y layouts de `app/` que solo componen
- componentes puramente presentacionales sin lógica
- tipos

**Herramientas:** Vitest (entorno `jsdom`) + Testing Library. Configuración en `vitest.config.mts`.

```sh
npm test                           # modo watch
npx vitest run                     # una sola ejecución (CI / reviewer)
npx vitest run modules/users       # solo un módulo o archivo
```

Los `async` Server Components se prueban con Vitest invocándolos como función: `render(await Component())` (ver `app/page.test.tsx`), mockeando las dependencias de servidor con `vi.mock` (`vi.hoisted` solo cuando haga falta inicializar mocks antes del hoisting de `vi.mock`). `redirect()`/`notFound()` se prueban con un mock que lanza y `await expect(Component()).rejects.toThrow(...)`. `await Component()` resuelve el componente raíz; los async Server Components anidados pueden requerir mocks (p. ej. mockear el hijo), otras técnicas o pruebas de integración/E2E.
