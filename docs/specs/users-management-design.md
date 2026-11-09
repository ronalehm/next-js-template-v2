# Gestión de usuarios: especificación de diseño (Figma)

- Módulo: users (+ shell del dashboard y cuenta)
- Estado: borrador
- Fuente: Figma "Gestión de usuarios — Template v2", https://www.figma.com/design/ihJfCObzth2fgdsWId9HBK (19 pantallas, aprobadas por el usuario el 2026-11-07)
- Destino: Template v2 PRO (`ronalehm/next-js-template-v2`). La implementación y su plan de tareas van en `docs/specs/auth-clerk-neon.md` de ese repo (AUTH-2 y AUTH-3); esta spec es la referencia visual y de interacción.

## Objetivo
Pasar la maqueta de Figma a una especificación implementable con shadcn/ui (Base UI) y Tailwind v4: tokens, tipografía, sombras, componentes, pantallas, estados, permisos por rol y movimiento, con estilo Apple.

## Alcance
- Incluye: tokens de diseño, mapeo a variables CSS de shadcn, 11 componentes, 19 pantallas, matriz de permisos por rol confirmada, reglas de movimiento y accesibilidad.
- Incluye también: tema oscuro (paleta en "Tokens de color (modo oscuro)") y la fuente del sistema de Apple como fuente de la plantilla (decisiones del usuario del 2026-11-07).
- No incluye: modelo de datos, server actions, migraciones ni rutas exactas (van en la spec de Template v2), versión móvil.
- Nota: el plan Starter de Figma solo permite un modo por colección y limita las llamadas del MCP. El tema oscuro está definido aquí, pero aún no tiene pantallas en Figma.

## Requisitos
1. R1: la UI usa solo los tokens de este documento; nada de colores sueltos en componentes.
2. R2: los componentes salen de shadcn/ui cuando existe un equivalente (tabla "Componentes"); los demás se componen con primitivas de shadcn.
3. R3: cada pantalla reproduce el layout, los textos y los estados de su frame en Figma (tabla "Pantallas").
4. R4: las acciones visibles dependen del rol según la matriz de permisos. La UI oculta lo que el rol no puede hacer, pero la autorización real se hace en el servidor.
5. R5: el correo y la contraseña de otra persona nunca se pueden editar (Clerk no lo permite); en el detalle se muestran con candado y solo lectura.
6. R6: el movimiento sigue la sección "Movimiento" y respeta `prefers-reduced-motion`.

## Criterios de aceptación
- [ ] CA1: con el sidebar expandido (260 px) se ven el logo, "Panel", los ítems y abajo a la izquierda el avatar, el nombre y el correo; al contraerlo (64 px) quedan el logo arriba, los iconos con tooltip y el avatar abajo.
- [ ] CA2: al pulsar el usuario en sesión se abre un menú anclado encima, con cabecera (nombre, correo) y las opciones Ver perfil, Configuración y Cerrar sesión, que navegan a sus páginas.
- [ ] CA3: la lista muestra buscador, filtro de estado, filtro de rol, orden, tabla, paginación y "Invitar usuario"; cada fila tiene Ver (ojo) y "…".
- [ ] CA4: Ver abre el panel lateral de detalle de solo lectura; correo y contraseña llevan candado y la nota de seguridad.
- [ ] CA5: los diálogos Invitar, Editar y Borrar, el selector de rol y el estado vacío coinciden con las pantallas 4, 5, 6, 14 y 7.
- [ ] CA6: un admin no ve "…" en filas de superadmins, de otros admins ni en la suya, y su menú no tiene Borrar; un usuario no ve "Usuarios" en el sidebar.
- [ ] CA7: Perfil muestra solo los campos opcionales con valor, más la fila "+ Añadir información · Opcional"; Configuración tiene Apariencia, Idioma y región, e Interfaz y avisos.
- [ ] CA8: el contraste del texto es ≥ 4.5:1 (salvo placeholders y deshabilitados), hay foco visible en todo control y el teclado abre y cierra menús y diálogos.

## Diseño técnico

### Tokens de color (modo claro)
| Token Figma | Valor | Variable shadcn / Tailwind |
|---|---|---|
| `color/bg/canvas` | `#FFFFFF` | `--background` |
| `color/bg/grouped` | `#F5F5F7` | `--muted` (fondo del área de contenido) |
| `color/bg/surface` | `#FFFFFF` | `--card`, `--popover` |
| `color/bg/sidebar` | `rgb(232 232 237 / 0.6)` | `--sidebar` |
| `color/fill/secondary` | `rgb(120 120 128 / 0.12)` | `--secondary`, `--input` (fondo del buscador) |
| `color/fill/hover` | `rgb(0 0 0 / 0.04)` | `--accent` (hover de fila) |
| `color/fill/selected` | `rgb(0 0 0 / 0.07)` | `--sidebar-accent` |
| `color/label/primary` | `#1D1D1F` | `--foreground`, `--card-foreground` |
| `color/label/secondary` | `#6E6E73` | `--muted-foreground` |
| `color/label/tertiary` | `#A1A1A6` | `--placeholder` (nuevo) |
| `color/label/on-accent` | `#FFFFFF` | `--primary-foreground` |
| `color/separator` | `rgb(60 60 67 / 0.16)` | `--border` |
| `color/accent` | `#007AFF` | `--primary`, `--ring`, `--sidebar-primary` |
| `color/accent/soft` | `rgb(0 122 255 / 0.12)` | `--primary-soft` (nuevo) |
| `color/destructive` | `#FF3B30` | `--destructive` |
| `color/destructive/soft` | `rgb(255 59 48 / 0.12)` | `--destructive-soft` (nuevo) |
| `color/success` | `#248A3D` | `--success` (nuevo) |
| `color/success/soft` | `rgb(52 199 89 / 0.16)` | `--success-soft` (nuevo) |
| `color/warning` | `#B25000` | `--warning` (nuevo) |
| `color/warning/soft` | `rgb(255 149 0 / 0.16)` | `--warning-soft` (nuevo) |
| `color/overlay` | `rgb(0 0 0 / 0.22)` | velo de `Dialog` / `AlertDialog` |
| `color/fill/switch-off` | `#E5E5EA` | `--switch-off` (nuevo): pista del switch apagado |

```css
/* app/globals.css: :root (los nuevos se exponen en @theme inline como --color-*) */
:root {
  --background: #ffffff;
  --foreground: #1d1d1f;
  --card: #ffffff;
  --card-foreground: #1d1d1f;
  --popover: #ffffff;
  --popover-foreground: #1d1d1f;
  --primary: #007aff;
  --primary-foreground: #ffffff;
  --secondary: rgb(120 120 128 / 0.12);
  --secondary-foreground: #1d1d1f;
  --muted: #f5f5f7;
  --muted-foreground: #6e6e73;
  --accent: rgb(0 0 0 / 0.04);
  --accent-foreground: #1d1d1f;
  --destructive: #ff3b30;
  --border: rgb(60 60 67 / 0.16);
  --input: rgb(60 60 67 / 0.16);
  --ring: #007aff;
  --radius: 0.75rem; /* 12px: card */
  --sidebar: rgb(232 232 237 / 0.6);
  --sidebar-foreground: #1d1d1f;
  --sidebar-primary: #007aff;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: rgb(0 0 0 / 0.07);
  --sidebar-accent-foreground: #1d1d1f;
  --sidebar-border: rgb(60 60 67 / 0.16);
  --sidebar-ring: #007aff;
  --placeholder: #a1a1a6;
  --primary-soft: rgb(0 122 255 / 0.12);
  --destructive-soft: rgb(255 59 48 / 0.12);
  --success: #248a3d;
  --success-soft: rgb(52 199 89 / 0.16);
  --warning: #b25000;
  --warning-soft: rgb(255 149 0 / 0.16);
  --switch-off: #e5e5ea;
}
```

### Tokens de color (modo oscuro)
Valores del sistema de Apple en modo oscuro. Mismas variables, bajo `.dark` (la plantilla ya tiene la variante `.dark` en `app/globals.css`). El selector Claro / Oscuro / Sistema de Configuración pone o quita la clase `dark` en `<html>`; "Sistema" sigue `prefers-color-scheme`.

| Token | Oscuro | Nota |
|---|---|---|
| `color/bg/canvas` | `#1C1C1E` | |
| `color/bg/grouped` | `#121214` | fondo del contenido, más oscuro que las tarjetas |
| `color/bg/surface` | `#1C1C1E` | tarjetas, menús y diálogos se separan por borde y sombra |
| `color/bg/sidebar` | `rgb(44 44 46 / 0.6)` | |
| `color/fill/secondary` | `rgb(118 118 128 / 0.24)` | |
| `color/fill/hover` | `rgb(255 255 255 / 0.05)` | |
| `color/fill/selected` | `rgb(255 255 255 / 0.10)` | |
| `color/fill/switch-off` | `#39393D` | |
| `color/label/primary` | `#F5F5F7` | |
| `color/label/secondary` | `#98989D` | |
| `color/label/tertiary` | `#636366` | |
| `color/label/on-accent` | `#FFFFFF` | también la perilla del switch en ambos temas |
| `color/separator` | `rgb(84 84 88 / 0.65)` | |
| `color/accent` | `#0A84FF` | |
| `color/accent/soft` | `rgb(10 132 255 / 0.20)` | |
| `color/destructive` | `#FF453A` | |
| `color/destructive/soft` | `rgb(255 69 58 / 0.20)` | |
| `color/success` | `#30D158` | |
| `color/success/soft` | `rgb(48 209 88 / 0.20)` | |
| `color/warning` | `#FF9F0A` | |
| `color/warning/soft` | `rgb(255 159 10 / 0.20)` | |
| `color/overlay` | `rgb(0 0 0 / 0.50)` | |

```css
.dark {
  --background: #1c1c1e;
  --foreground: #f5f5f7;
  --card: #1c1c1e;
  --card-foreground: #f5f5f7;
  --popover: #1c1c1e;
  --popover-foreground: #f5f5f7;
  --primary: #0a84ff;
  --primary-foreground: #ffffff;
  --secondary: rgb(118 118 128 / 0.24);
  --secondary-foreground: #f5f5f7;
  --muted: #121214;
  --muted-foreground: #98989d;
  --accent: rgb(255 255 255 / 0.05);
  --accent-foreground: #f5f5f7;
  --destructive: #ff453a;
  --border: rgb(84 84 88 / 0.65);
  --input: rgb(84 84 88 / 0.65);
  --ring: #0a84ff;
  --sidebar: rgb(44 44 46 / 0.6);
  --sidebar-foreground: #f5f5f7;
  --sidebar-primary: #0a84ff;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: rgb(255 255 255 / 0.10);
  --sidebar-accent-foreground: #f5f5f7;
  --sidebar-border: rgb(84 84 88 / 0.65);
  --sidebar-ring: #0a84ff;
  --placeholder: #636366;
  --primary-soft: rgb(10 132 255 / 0.20);
  --destructive-soft: rgb(255 69 58 / 0.20);
  --success: #30d158;
  --success-soft: rgb(48 209 88 / 0.20);
  --warning: #ff9f0a;
  --warning-soft: rgb(255 159 10 / 0.20);
  --switch-off: #39393d;
}
```

Reglas del tema oscuro:
- Las sombras de las tarjetas casi no se ven sobre fondo oscuro: la separación la da el anillo de 0.5 px de las sombras más el borde `--border`.
- El segmento activo del control segmentado usa `#636366` en vez de `--card` para destacar sobre `--secondary`.
- Las vistas previas de tema y los degradados de avatar y logo son iguales en ambos temas.
- El cambio de tema se hace con un fundido de 200 ms sobre `background-color` y `color`, sin saltos bruscos de brillo (accesibilidad Apple).
- Con `prefers-reduced-transparency: reduce`, el sidebar oscuro usa el sólido `#2C2C2E`.

### Radios
| Token | Valor | Uso |
|---|---|---|
| `radius/segment` | 6 px | segmentos, ítems de menú, botón "…" |
| `radius/control` | 8 px | botones, inputs, buscador, ítems del sidebar |
| `radius/card` | 12 px | tarjetas, tabla, menús, panel de detalle |
| `radius/sheet` | 14 px | diálogos, marco de vista previa del tema |
| `radius/full` | 999 px | avatar, badges, switch |

### Tipografía
Decisión del usuario (2026-11-07): la fuente de la plantilla es la del sistema de Apple, SF Pro. La licencia de Apple no permite servir SF Pro como webfont, así que se pide por nombre de sistema: en macOS e iOS se ve SF Pro (Text y Display con tamaño óptico automático), y en Windows, Android y Linux entra Inter como respaldo, que es la misma fuente que usa Figma. Geist deja de usarse.

```css
/* app/globals.css, dentro de @theme inline */
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", var(--font-inter), system-ui, sans-serif;
```

```tsx
// app/layout.tsx: Inter de next/font solo como respaldo; se quita Geist
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// <html lang="es" className={cn("font-sans antialiased", inter.variable)}>
```

Con `font-optical-sizing: auto`. El tracking negativo de los títulos (tabla siguiente) ya está pensado para SF Pro Display.

| Estilo | Tamaño / interlínea | Peso | Tracking | Uso |
|---|---|---|---|---|
| Título grande | 32 / 38 | 700 | -1% | título de página |
| Título | 22 / 28 | 700 | -0.5% | título de diálogo, nombre en perfil |
| Título 3 | 17 / 22 | 600 | -0.3% | nombre de app, título del panel, estado vacío |
| Encabezado | 14 / 19 | 600 | 0 | nombre en fila, ítem activo |
| Cuerpo | 14 / 19 | 400 | 0 | texto general, celdas, inputs |
| Botón | 14 / 18 | 500 | 0 | etiqueta de botón |
| Subtítulo | 13 / 17 | 400 | 0 | correo en fila, subtítulos |
| Subtítulo medio | 13 / 17 | 500 | 0 | etiqueta de campo, segmento activo |
| Nota | 12 / 16 | 400 | 0 | cabecera de tabla, badges, notas |
| Etiqueta | 11 / 13 | 600 | +4%, MAYÚSCULAS | título de grupo y sección |

### Sombras y materiales
| Estilo | Valor CSS |
|---|---|
| Sombra/Tarjeta | `0 1px 2px rgb(0 0 0/.05), 0 4px 16px rgb(0 0 0/.05)` |
| Sombra/Control | `0 1px 1px rgb(0 0 0/.08), 0 0 0 .5px rgb(0 0 0/.10)` |
| Sombra/Popover | `0 10px 30px rgb(0 0 0/.16), 0 0 0 .5px rgb(0 0 0/.12)` + `backdrop-filter: blur(30px)` |
| Sombra/Hoja | `0 24px 60px rgb(0 0 0/.22), 0 0 0 .5px rgb(0 0 0/.10)` + `backdrop-filter: blur(30px)` |
| Foco | borde 2 px `--primary` + `0 0 0 3px rgb(0 122 255/.25)` |

El sidebar es una capa translúcida (`--sidebar` + `backdrop-filter: blur(20px) saturate(180%)`) con un borde derecho de 1 px `--border`. Con `prefers-reduced-transparency: reduce` usa un fondo sólido `#F1F1F4` sin blur.

### Iconos
`lucide-react`, trazo 1.75: `house`, `users`, `search`, `user-plus`, `chevrons-up-down`, `chevron-down`, `chevron-left`, `chevron-right`, `ellipsis`, `eye`, `pencil`, `trash-2`, `lock`, `log-out`, `panel-left`, `check`, `plus`, `x`. Tamaños: 14 (chevrons, candado), 16 (botones, filas), 18 (sidebar), 20 a 26 (iconos de diálogo y estados vacíos).

### Componentes (Figma → shadcn)
| Figma (nodo) | shadcn / composición | Variantes y props | Medidas |
|---|---|---|---|
| Avatar (`2:50`) | `avatar` | tamaño S 32, M 36, L 80; iniciales; foto si existe, si no degradado por usuario | iniciales 12/13/28, peso 600, blanco |
| Botón (`2:79`) | `button` | Primario = `default`, Secundario = `secondary`, Destructivo = `destructive`, Plano = `link`/`ghost` con texto `--primary`; icono opcional | h 32, px 14, gap 6, radio 8 |
| Estado (`2:89`) | `badge` | Activo (success), Inactivo (secondary), Invitado (warning); punto de 6 px | px 8, py 2, texto 12 |
| Campo de búsqueda (`2:90`) | `input` + icono | placeholder "Buscar por nombre o correo" | 300 × 32, fondo `--secondary`, sin borde |
| Botón emergente (`2:95`) | `select` / `dropdown-menu` trigger | "Rol: Todos", "Ordenar: Nombre A–Z" | h 32, pl 12, pr 8, fondo card + Sombra/Control |
| Control segmentado (`2:100`) | `toggle-group` (single) o `tabs` | Todos · Activos · Inactivos · Invitados | h 32, padding 2, segmento activo blanco + Sombra/Control |
| Ítem de menú (`2:115`) | `dropdown-menu` item | Normal, Resaltado (hover: fondo `--primary`, texto blanco), Destructivo (texto `--destructive`) | h 30, px 10, radio 6 |
| Usuario en sesión (`2:134`) | `sidebar` footer + `dropdown-menu` trigger (patrón nav-user) | Normal, Activo (menú abierto: `--sidebar-accent`) | 236 × 52, avatar S, nombre 14/600, correo 12, `chevrons-up-down` |
| Fila de usuario (`2:169`) | `table` row | Normal, Resaltado (hover `--accent`) | h 60, px 16, gap 16; columnas: avatar 36, persona (crece), rol 150, estado 120, último acceso 120, acciones 60 (Ver 28 + gap 4 + "…" 28) |
| Campo de formulario (`2:188`) | `label` + `input` / `select` | Normal, Enfocado, Deshabilitado, Selector | etiqueta 13/500 secundaria, gap 6, input h 36, radio 8, borde 1 `--border` |
| Barra lateral (`2:269`) | `sidebar` `collapsible="icon"` | Vista: Usuarios / Cuenta / Sin acceso; Estado: Expandida (260) / Contraída (64) | ver "Shell" |
| Switch (en Configuración) | `switch` | on = `--primary`, off = `#E5E5EA` | 38 × 22, perilla 18 con sombra |
| Panel de detalle | `sheet` side="right" | sin velo (no bloquea la lista) | 420 de ancho, alto completo |
| Diálogos | `dialog` / `alert-dialog` | Invitar, Editar (440), Borrar (340) | ver "Diálogos" |
| Tooltip | `tooltip` | solo con el sidebar contraído | px 8, py 4, radio 6, Sombra/Popover |

### Shell
- Ventana de referencia: 1440 × 900. Fila horizontal: sidebar + contenido (crece).
- Sidebar expandido 260: padding 12 (arriba 20). Marca: logo de 28 (radio 8, degradado `#3D9BFF → #0060DF`, "P" blanca) + "Panel" (Título 3) + botón Contraer (`panel-left` 18) a la derecha. Sección "GENERAL" (Etiqueta, terciaria). Ítem: h 34, px 10, gap 10, icono 18, radio 8; activo con fondo `--sidebar-accent`, icono `--primary` y texto 600. Un espacio flexible empuja abajo al usuario en sesión.
- Sidebar contraído 64: logo de 28 arriba, botón Expandir 40 × 32, separador de 24 px, ítems 40 × 36 solo con icono, tooltip a 6 px a la derecha y avatar S abajo.
- Contenido: fondo `--muted`, padding 36 arriba, 40 a los lados, 32 abajo; gap vertical 24; se apila desde arriba.

### Pantallas
| # | Frame (nodo) | Rol | Contenido clave |
|---|---|---|---|
| 01 | Usuarios — lista (`3:34`) | superadmin | título "Usuarios" + "24 personas con acceso al panel"; "Invitar usuario" (primario con `user-plus`); barra: buscador, segmentado, espacio, "Rol: Todos", "Ordenar: Nombre A–Z"; tabla en tarjeta (cabecera h 36: "Nombre ↑", Rol, Estado, Último acceso); 8 filas con separador inset de 68; paginación "1–8 de 24 usuarios" · "Página 1 de 3" · ‹ › (28 × 28) |
| 02 | Menú del avatar (`3:277`) | superadmin | menú de 236 sobre el pie (x 12, 6 px por encima): cabecera nombre/correo, separador, Ver perfil (resaltado), Configuración, separador, Cerrar sesión |
| 03 | Acciones por fila (`3:542`) | superadmin | fila resaltada; menú de 200 alineado a la derecha del "…", 4 px debajo: Ver detalles, Editar, Inactivar/Activar, separador, Borrar (destructivo) |
| 04 | Invitar usuario (`3:794`) | superadmin | velo + diálogo de 440: icono `user-plus` en círculo de 40 `--primary-soft`, "Invitar usuario", texto de ayuda, Correo (enfocado), Rol (selector), nota "Solo un superadmin puede invitar administradores.", Cancelar · Enviar invitación |
| 05 | Editar usuario (`3:1074`) | superadmin | diálogo de 440: avatar M + nombre + "Activo · Último acceso…", Nombre y Apellido en dos columnas, Correo deshabilitado + "El correo lo cambia la propia persona desde su perfil.", Rol (selector) + "Solo un administrador o un superadmin puede cambiar el rol.", Cancelar · Guardar cambios |
| 06 | Confirmar borrar (`3:1362`) | superadmin | alerta de 340 centrada: `trash-2` en círculo de 48 `--destructive-soft`, "¿Borrar a Diego Rojas?", "Perderá el acceso de inmediato. Esta acción no se puede deshacer.", Cancelar · Borrar (mismo ancho) |
| 07 | Búsqueda sin resultados (`3:1631`) | superadmin | buscador con "xavier"; en la tabla, bloque de 440 de alto centrado: lupa en círculo de 56, "Sin resultados para “xavier”", ayuda, botón plano "Quitar filtros"; paginación "0 resultados" |
| 08 | Ver perfil (`4:1223`) | todos | columna de 720: tarjeta (avatar L, nombre Título, correo, rol + estado, "Cambiar foto"); grupos INFORMACIÓN PERSONAL (Nombre, Apellido, Teléfono, Cargo, "+ Añadir información · Opcional"), CORREOS (principal + "Añadir correo"), SEGURIDAD (Contraseña, Sesiones activas); filas de 44 con chevron |
| 09 | Configuración (`4:1328`) | todos | APARIENCIA: tres vistas previas de 168 × 100 (Claro, Oscuro, Sistema) con radio y marco de 2.5 px `--primary` en la elegida; IDIOMA Y REGIÓN (Idioma, Zona horaria, Formato de fecha); INTERFAZ Y AVISOS (Densidad Cómoda/Compacta, Reducir movimiento, Avisos por correo) y una nota sobre dónde se guarda cada cosa |
| 10 | Cerrar sesión (`4:1422`) | todos | tarjeta centrada de 420: `log-out` en círculo de 56, "¿Cerrar sesión?", texto, cuenta actual (avatar S + nombre + correo), Cancelar · Cerrar sesión |
| 11 | Usuario — sin permiso (`4:1482`) | user | centrado: candado en círculo de 56, "No tienes acceso a Usuarios", explicación, "Volver al inicio" |
| 12 | Detalle de usuario (`7:1432`) | admin, superadmin | `sheet` de 420 a la derecha: "Detalle de usuario" + cerrar; avatar L, nombre, correo, rol + estado; CUENTA (Nombre, Apellido, Correo con candado, Contraseña •••• con candado, Rol) + nota "Por seguridad, solo Carla puede cambiar su correo o su contraseña desde su perfil."; ACTIVIDAD (Alta, Invitado por, Último acceso, Sesiones activas); abajo, Cerrar · Editar |
| 13 | Barra lateral contraída (`8:1848`) | superadmin | igual que 01 con el sidebar de 64 y tooltip "Usuarios" |
| 14 | Editar — cambiar rol (`8:1980`) | admin, superadmin | selector abierto del ancho del campo: ✓ Usuario "Acceso básico al panel"; Administrador "Gestiona usuarios" (resaltado); Superadmin deshabilitado "No se asigna desde el panel" |
| 15 | Admin — lista (`9:2395`) | admin | igual que 01 con subtítulo "Puedes gestionar a quienes tienen rol Usuario"; sin "…" (el espacio se conserva) en las filas de superadmin, admins y la propia |
| 16 | Admin — acciones por fila (`9:2619`) | admin | menú sin Borrar |
| 17 | Usuario — inicio (`9:2916`) | user | sidebar solo con Inicio (activo); "Hola, Carla"; tarjetas TU CUENTA (avatar, rol, estado, "Ver perfil") y PREFERENCIAS (tema, idioma, zona horaria, "Configuración"); aviso con candado sobre el rol |
| 18 | Permisos por rol (`9:3006`) | doc | matriz (abajo) |
| 19 | Perfil — añadir información (`10:2848`) | todos | menú de 240 bajo la fila "+ Añadir información": Empresa, Cumpleaños, Sitio web, Ubicación, separador, Campo personalizado… (solo los que aún no tienen valor) |

Componentes de referencia: frame "Componentes" (`2:43`). Datos de ejemplo: 8 usuarios genéricos; Ana Torres (superadmin), Bruno Díaz y Elena Vargas (admin), y el resto con rol Usuario.

### Matriz de permisos (confirmada por el usuario el 2026-11-07)
| Acción | user | admin | superadmin |
|---|---|---|---|
| Ver Inicio, perfil, configuración, cerrar sesión | sí | sí | sí |
| Ver la lista de usuarios y su detalle | no | sí | sí |
| Invitar | no | con rol Usuario | Usuario o Administrador |
| Editar nombre y apellido | no | de usuarios con rol Usuario | de usuarios y administradores |
| Cambiar rol | no | Usuario ↔ Administrador, solo sobre usuarios con rol Usuario | Usuario ↔ Administrador |
| Inactivar / activar | no | a usuarios con rol Usuario | a usuarios y administradores |
| Borrar | no | no | a usuarios y administradores |
| Cambiar correo o contraseña de otra persona | no | no | no |

Reglas: nadie cambia su propio rol, se inactiva ni se borra a sí mismo. El rol superadmin no se asigna desde el panel. Siempre queda al menos un superadmin activo. El correo y la contraseña los cambia solo su dueño desde Ver perfil.

### Movimiento (Apple)
- Respuesta inmediata al pulsar (`:active` → `scale(.97)` en 100 ms).
- Menús, popovers y tooltips nacen de su disparador (`transform-origin` en el trigger), con opacidad + escala de .96 a 1 y un spring sin rebote (bounce 0, ~0.25 s); se cierran por el mismo camino.
- El `sheet` de detalle entra y sale por la derecha; los diálogos aparecen con velo y escala de .98 a 1. Sin rebote: ninguno sigue a un gesto con impulso.
- Sidebar contraer/expandir: el ancho cambia de 260 a 64 con un spring sin rebote y las etiquetas se desvanecen antes de que se cierre el ancho.
- `prefers-reduced-motion: reduce`: solo fundidos de opacidad de 150 ms. La preferencia "Reducir movimiento" de Configuración fuerza lo mismo.

### Accesibilidad
- Contraste: texto primario y secundario ≥ 4.5:1 sobre blanco y sobre `#F5F5F7`; el terciario solo se usa en placeholders, deshabilitados y texto auxiliar.
- Botones solo con icono (Ver, "…", Contraer/Expandir, cerrar) con `aria-label`; tooltip en el sidebar contraído.
- Menús y diálogos accesibles por teclado (Base UI): foco atrapado en los diálogos, Escape cierra y el foco vuelve al disparador.
- Badges de estado con texto, no solo color.

## Reutilización
- shadcn ya en la plantilla: `button`. Por instalar: `sidebar` (trae `sheet`, `tooltip`, `input`, `separator`, `skeleton`, `use-mobile`), `avatar`, `badge`, `dropdown-menu`, `dialog`, `alert-dialog`, `table`, `label`, `select`, `toggle-group`, `switch`.
- Patrón nav-user del bloque sidebar de shadcn para el usuario en sesión.
- `cn()` y `lucide-react`.

## Tests
Sin unit tests de componentes presentacionales. La lógica de permisos (matriz) se prueba donde se implemente (`lib/roles.ts` en Template v2) con un caso por celda de la matriz y por cada regla.

## Plan de tareas
Se define en `docs/specs/auth-clerk-neon.md` de Template v2 PRO (AUTH-2: shell, sidebar contraíble, menú del avatar, páginas de cuenta; AUTH-3: lista, detalle, diálogos, vistas por rol). Esta spec no lleva tareas de código propias.

## Preguntas abiertas
Cerradas por el usuario el 2026-11-07: fuente = sistema de Apple (SF Pro, Inter de respaldo); tema oscuro = sí, con la paleta de esta spec.

- P3: dónde se guardan los campos opcionales del perfil y las preferencias de cuenta (Neon frente a metadata de Clerk); se decide en la spec de Template v2.
