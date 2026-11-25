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

## Cómo crear un proyecto independiente

**Objetivo:** obtener un repositorio propio, con identidad, gobierno SDD, instancia Clerk, base Neon y posterior despliegue independientes. No basta con ejecutar `git clone` sobre el repositorio de origen: ese comando deja `origin` apuntando a Template V2 PRO y conserva su historial.

### Paso 1. Crear el repositorio del proyecto

**Ruta validada por el propietario:** utilizar el agente de replicación aislada ya probado o el procedimiento manual **Bootstrap B1 v1.2**. Sus nombres, comandos y evidencia deben enlazarse desde una ubicación estable antes de declararlos incluidos en una Release; este README no inventa una invocación del agente ni sustituye el manual.

**Ruta nativa de GitHub (alternativa):** este repositorio tiene habilitado **Use this template**.

1. Abrir [Template V2 PRO](https://github.com/ronalehm/next-js-template-v2) en GitHub y elegir **Use this template → Create a new repository**.
2. Seleccionar propietario, nombre y visibilidad del **nuevo** proyecto (por ejemplo, `proyecto-mbc`; mantenerlo privado si corresponde).
3. Crear el repositorio y clonarlo desde **su nueva URL**, no desde la URL del Template. En PowerShell, desde la carpeta donde guardarás los proyectos:

   ```powershell
   git clone https://github.com/USUARIO/PROYECTO-NUEVO.git
   cd PROYECTO-NUEVO
   git remote -v
   git branch --show-current
   ```

   Sustituir `USUARIO/PROYECTO-NUEVO` por el destino real. `origin` debe apuntar **solo al repositorio nuevo**; revisar la identidad del proyecto en `package.json`, `package-lock.json` y el README antes de empezar a desarrollar.

4. **Separar el gobierno histórico del origen antes del primer uso.** `Use this template` crea historial Git propio, **pero copia también archivos del árbol**, incluidas specs, firmas y registros históricos del Template. **No** tratarlos como aprobaciones del proyecto nuevo. Aplicar la cuarentena y configuración de firma propia descritas en Bootstrap B1 v1.2; preservar la evidencia histórica fuera del flujo activo del derivado. La ruta nativa no equivale por sí sola a una instalación B1/B2 validada.

### Paso 2. Crear Clerk exclusivo del proyecto

1. Entrar en [Clerk Dashboard](https://dashboard.clerk.com/) y crear una **aplicación/instancia de Development** para el proyecto nuevo.
2. En **API Keys**, identificar `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` **de esa misma instancia**.
3. Si el proyecto usa el webhook implementado en el Template, configurar el endpoint correspondiente en Clerk y obtener `CLERK_WEBHOOK_SIGNING_SECRET` para **ese** endpoint.
4. Conservar las claves privadas fuera de Git. No reutilizar una instancia de Clerk del Template, AppMADRE, CRM-IA ni producción.

### Paso 3. Crear Neon exclusivo del proyecto

1. Entrar en [Neon Console](https://console.neon.tech/) y crear preferiblemente **un proyecto Neon nuevo** para el derivado, con la región y la base de datos deseadas.
2. Identificar y registrar **sin contraseñas** el proyecto, rama, base de datos y hosts previstos para aplicación y migraciones. Una rama llamada `production` dentro de un proyecto Neon aislado **no implica** que se esté usando la base PROD del Template: verificar el ID del proyecto completo.
3. Copiar la conexión **pooled** (host `-pooler`) a `DATABASE_URL` para la aplicación; copiar la conexión **directa** a `DATABASE_URL_UNPOOLED` para las migraciones y el alta administrativa. Ambas deben señalar el mismo proyecto/rama/base de prueba.
4. No reutilizar conexiones, credenciales ni datos de otros proyectos.

### Paso 4. Configurar la copia y comprobar el aislamiento

1. Instalar Node.js 26.x y, dentro del nuevo proyecto, ejecutar `npm ci --ignore-scripts`.
2. Copiar `.env.example` a `.env.local` y colocar las claves **del proyecto nuevo**, nunca en el README ni en un commit.
3. Verificar que `.env.local` está ignorado y no rastreado por Git; confirmar en la **misma sesión de terminal** las variables efectivas, incluidas variables heredadas que puedan prevalecer.
4. Cotejar los destinos reales de Clerk, `DATABASE_URL` y `DATABASE_URL_UNPOOLED` con sus paneles **antes de conectar, migrar o conceder roles**. Los scripts actuales usan `DATABASE_URL_UNPOOLED || DATABASE_URL`: si falta la primera, recurren a la segunda. No ejecutar en caso de duda.

La guía con instrucciones y comprobaciones es [`docs/INSTALACION.md`](docs/INSTALACION.md); las autorizaciones están en [`docs/SETUP.md`](docs/SETUP.md).

### Paso 5. Instalar y validar funcionalmente (solo en el entorno aislado)

Una vez confirmados los destinos y obtenidas las autorizaciones aplicables:

```bash
npm run db:migrate
npm run db:grant-superadmin -- CORREO-DE-PRUEBA
npm run dev
```

Reemplazar `CORREO-DE-PRUEBA` por un correo realmente controlado en la instancia Clerk del derivado. Comprobar en `localhost` el inicio de sesión, que las migraciones se aplicaron **solo** a Neon de prueba y que el superadministrador tiene acceso administrativo mientras que un usuario normal no lo tiene. No copiar cuentas, secretos ni aprobaciones del origen.

### Paso 6. Trabajar y desplegar con identidad propia

Crear ramas y PR **en el repositorio nuevo**, ejecutar Reviewer y CI, obtener las aprobaciones del proyecto y configurar Vercel/Cloudflare por entorno cuando corresponda. El despliegue es una etapa distinta de la instalación local. Para más detalles y requisitos de seguridad consulta [`docs/INSTALACION.md`](docs/INSTALACION.md) y el gobierno vigente de `main` del repositorio receptor.

**Pendiente de documentación de entrega:** incorporar el enlace verificable al manual B1 v1.2, el identificador/invocación del agente replicador y las evidencias de B2 y despliegue. Esos artefactos fueron reportados como probados por el propietario, pero este README no los presenta como archivos versionados cuando no lo están.

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
