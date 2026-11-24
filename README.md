# Template V2 PRO

Plantilla base reutilizable para proyectos independientes desarrollados con Next.js, Clerk, Neon y un flujo de trabajo gobernado por **SDD (Spec Driven Development)** y **ODD-LIGHT**. El repositorio de la plantilla no es una aplicación de producción: cada derivado debe mantener identidad, repositorio, credenciales, base de datos y despliegue propios.

## Arquitectura de reutilización

```text
Template V2 PRO (código base y gobierno de desarrollo)
  ├── AppMADRE        → Git, Clerk, Neon y Vercel propios
  ├── CRM-IA          → Git, Clerk, Neon y Vercel propios
  └── Proyecto futuro → Git, Clerk, Neon y Vercel propios
```

**No reutilizar secretos, conexiones, usuarios administrativos ni firmas locales del origen.** Las aprobaciones y autorizaciones de SDD son específicas de la raíz del proyecto, la fase y la firma del aprobador; no se heredan como permisos válidos de un derivado.

## Tecnologías

| Área | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Interfaz | Tailwind CSS v4, shadcn/ui (`base-nova`, Base UI), lucide-react |
| Datos y estado | axios, TanStack Query, TanStack Table, zod, zustand |
| Autenticación | Clerk |
| Persistencia | Neon PostgreSQL |
| Pruebas | Vitest, Testing Library y CI de GitHub Actions |

**Requisitos:** Node.js 26.x y npm; `.nvmrc`, `.node-version` y `engines.node` declaran la rama 26. En Windows, utiliza un gestor de versiones compatible con Windows; `nvm` de Linux/macOS no tiene por qué usar los mismos comandos.

## Comenzar un proyecto nuevo

1. **Crear el derivado independiente.** Aplicar el procedimiento validado de Bootstrap B1 o el agente de replicación autorizado por el propietario. Este README no reemplaza el manual B1. Comprobar identidad propia y repositorio Git independiente **antes de enlazar un remoto de proyecto**. Atención: `git clone https://github.com/ronalehm/next-js-template-v2.git` por sí solo conserva el historial y configura `origin` hacia la plantilla; no completa el aislamiento del derivado.
2. **Preparar el entorno aislado.** Crear una instancia de Clerk Development y un proyecto o rama Neon destinados exclusivamente al derivado. No reutilizar recursos ni datos del repositorio origen ni de otros proyectos.
3. **Configurar y validar.** Seguir [`docs/INSTALACION.md`](docs/INSTALACION.md) para `.env.local`, destinos efectivos, migraciones y primer superadministrador.
4. **Verificar.** Ejecutar las comprobaciones funcionales, documentar los resultados y aprobar las operaciones sensibles conforme a [`docs/SETUP.md`](docs/SETUP.md).
5. **Desarrollar con PR.** Utilizar la rama propia del proyecto y el flujo Reviewer → CI → revisión humana. Cada derivado decide y documenta su propio despliegue y gobierno.

**Nota de documentación:** el manual B1 v1.2 y el agente de replicación fueron comunicados como validados por el propietario, pero sus archivos/versiones aún deben incorporarse o referenciarse mediante una ubicación estable antes de declarar completo el paquete documental de entrega.

## Arranque de una copia ya independizada

```bash
npm ci --ignore-scripts
# Configurar .env.local a partir de .env.example y cotejar los destinos efectivos
# Los siguientes comandos se ejecutan únicamente sobre recursos aislados y autorizados:
# npm run db:migrate
# npm run db:grant-superadmin -- admin-de-prueba@ejemplo.com
npm run dev  # http://localhost:3000
```

La instalación con `--ignore-scripts` está documentada para las dependencias de esta plantilla; los derivados que añadan paquetes pueden requerir otro procedimiento. El build necesita las `devDependencies`. Para la preparación completa consulta [`docs/INSTALACION.md`](docs/INSTALACION.md), no ejecutes migraciones basándote únicamente en este bloque.

## Comandos disponibles

| Comando | Función |
| --- | --- |
| `npm run dev` | Servidor local |
| `npm run build` | Compilación y comprobación de tipos |
| `npm run start` | Ejecutar el build |
| `npm run lint` | ESLint |
| `npx vitest run` | Pruebas una vez |
| `npm test` | Vitest en modo watch |
| `npx shadcn@latest add <componente>` | Añade un componente de shadcn/ui a `components/ui/` |
| `npm run db:migrate` | Aplica migraciones pendientes al destino configurado; requiere verificación y autorización |
| `npm run db:grant-superadmin -- <correo>` | Concede rol inicial en el destino configurado; requiere verificación y autorización |

## Estructura

```text
app/                    Rutas Next.js
components/ui/          Componentes base
components/shared/      Componentes reutilizables
hooks/                  Hooks compartidos
lib/                    Utilidades y acceso global
modules/<dominio>/       Código de dominio
db/migrations/          Migraciones SQL
scripts/                 Scripts de operación
docs/SETUP.md            Fuente normativa de desarrollo y gobierno
docs/INSTALACION.md      Guía funcional complementaria
docs/specs/             Especificaciones SDD y evidencia histórica
.claude/agents/          Agentes del flujo de trabajo
.claude/hooks/           Controles técnicos de aprobación
.github/workflows/       CI de PR
```

## SDD/ODD y cinco agentes

La fuente de verdad de rutas, permisos y autorizaciones es [`docs/SETUP.md`](docs/SETUP.md). Existen **cinco** agentes:

| Agente | Responsabilidad |
| --- | --- |
| `orchestrator` | Clasifica READ-ONLY, BUILD, SDD-LITE o SDD-ADVANCED y coordina |
| `spec` | Prepara una especificación en borrador, sin aprobarla |
| `developer` | Implementa únicamente dentro de la ruta y alcance autorizados |
| `reviewer` | Revisa código, pruebas y conformidad con la tarea/spec |
| `product` | Guía la UAT funcional **asistida**, con evidencia y decisión humana; no publica |

Iniciar el flujo de desarrollo con:

```bash
claude --agent orchestrator
```

Para una especificación SDD, el aprobador debe escribir exactamente `apruebo docs/specs/<slug>.md` **y además firmar desde su propia terminal la declaración generada por el hook**, verificando la firma SSH. El comando en el chat o la firma HMAC del registro **no bastan**. Las rutas de gobierno requieren adicionalmente `autorizo gobierno docs/specs/<slug>.md` y su firma de gobierno, dentro del alcance y sesión correspondientes. El `gate` es quien determina si la aprobación es utilizable. No importar firmas, registros de aprobación ni claves privadas de la plantilla a proyectos derivados.

Revisa [`docs/SETUP.md`, sección 3](docs/SETUP.md) y [`CLAUDE.md`](CLAUDE.md) para instrucciones precisas. **No se modifican hooks ni reglas de gobierno por esta actualización documental.**

## Control de cambios y entrega

El flujo recomendado es: **rama de trabajo → PR → Reviewer → CI (`checks` + `audit`) → decisión humana de merge → sincronización de `main` local**. La plantilla de PR está en [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).

> **Estado de control al preparar esta propuesta (24/11/2026):** GitHub reporta `main` sin protección automática. Mientras siga así, las revisiones y checks constituyen un **control operativo** y no impiden técnicamente un push directo. Una rama protegida requiere configuración administrativa y disponibilidad del plan de GitHub.

La propuesta de primera entrega y sus límites se documentan en [`docs/RELEASE-v0.1.0-PROPUESTA.md`](docs/RELEASE-v0.1.0-PROPUESTA.md). No publicar una GitHub Release ni afirmar «apto para producción» sin verificar su evidencia y obtener autorización del propietario.

## Skills recomendadas (opcionales)

Plugins y skills de Claude Code que complementan esta plantilla. Los comandos con `/plugin` se escriben dentro de Claude Code; reinicia la sesión después de instalar.

| Skill | Para qué | Instalación |
|---|---|---|
| [**frontend-design**](https://github.com/anthropics/claude-plugins-official) (Anthropic) | Interfaces con diseño cuidado en vez del aspecto genérico de IA. | `/plugin install frontend-design@claude-plugins-official` |
| [**ui-ux-pro-max**](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Base de estilos, paletas, tipografías y guías UX. | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` y `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` |
| [**vercel-labs/agent-skills**](https://github.com/vercel-labs/agent-skills) | Buenas prácticas de React/Next.js. | `npx skills add vercel-labs/agent-skills` |
| [**ponytail**](https://github.com/dietrichgebert/ponytail) | Simplicidad KISS/YAGNI. | `/plugin marketplace add dietrichgebert/ponytail` y `/plugin install ponytail@ponytail` |
| [**caveman**](https://github.com/JuliusBrussee/caveman) | Respuestas compactas de Claude. | `/plugin marketplace add JuliusBrussee/caveman` y `/plugin install caveman@caveman` |
| [**superpowers**](https://github.com/obra/superpowers-marketplace) | Planificación, TDD y depuración. | `/plugin marketplace add obra/superpowers-marketplace` y `/plugin install superpowers@superpowers-marketplace` |

Las skills de diseño trabajan sobre shadcn/ui y los tokens existentes. `superpowers` y otras skills **no reemplazan** el proceso SDD, los hooks, Reviewer ni CI.
