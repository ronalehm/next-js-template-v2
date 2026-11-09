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
- Mientras una spec con su plan abierto liste una ruta sensible, `Modo: build` puede editarla: el hook no conoce la tarea. `reviewer` lo revisa en el diff.
- Las únicas capas fuera del alcance del usuario local son `managed-settings.json`, protegido por administrador, y reglas del servidor Git.

### Planes alcanzables

- Cada fase de una spec tiene como máximo **5 tareas y ~15 archivos**, para que quepa en una sesión de desarrollo.
- Un pedido mayor se divide en fases, cada una entregable y funcional por sí misma. Se ejecuta una fase por sesión; el progreso queda en las casillas del plan de tareas de la spec.

### Ejecución en paralelo

- Cada tarea del plan declara los archivos que crea o modifica. Dos tareas se lanzan en paralelo solo si sus archivos son disjuntos y no dependen entre sí.
- Lo que toca archivos compartidos va primero y en secuencia: instalar dependencias o componentes shadcn, `package.json`, `app/layout.tsx`, `app/providers.tsx`, `lib/`, `components/ui/`, `components/shared/` y los `index.ts` de módulos.
- Todo developer, en paralelo o no, solo toca sus archivos, verifica con `vitest`/`eslint` sobre ellos (`npx vitest run <archivos>`, `npx eslint <archivos>`) y no ejecuta `npm run build` ni `npx vitest run` sin argumentos (dos builds simultáneos chocan en `.next/`). La verificación integral la ejecuta el reviewer una vez por revisión, según la tabla de su agente.
- Nadie hace commits; los decide el usuario.

### Agentes

| Agente | Responsabilidad | Entrada | Salida |
|---|---|---|---|
| **Orquestador** | Recibe el pedido, decide la ruta, invoca a los demás agentes (en paralelo cuando el plan lo permite) y controla que cada fase se cierre antes de pasar a la siguiente. No escribe código ni specs. | Pedido del usuario | Clasificación, avance y resumen final |
| **Spec** | Convierte el pedido en una especificación clara y verificable. Revisa qué existe ya en el proyecto y en shadcn. | Tarea del orquestador | `docs/specs/<module>-<feature>.md` |
| **Developer** | Implementa exactamente lo que dice la spec, siguiendo las secciones 1 y 2 de este documento, y escribe los unit tests requeridos. | Spec aprobada | Código y tests que pasan |
| **Reviewer** | Verifica el código contra la spec y este documento. Aprueba o devuelve con observaciones concretas. No corrige el código él mismo. | Spec + cambios | Aprobado / lista de observaciones |

Definidos en `.claude/agents/` (`orchestrator.md`, `spec.md`, `developer.md`, `reviewer.md`).

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
6. **Cierre:** el orquestador marca las tareas hechas en el plan; si quedan fases, se continúan en otra sesión.

Si durante la implementación la spec resulta incompleta o incorrecta, se actualiza la spec primero y luego el código, nunca al revés.

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

Los `async` Server Components no se pueden probar con Vitest; se cubren con tests E2E cuando se configuren.
