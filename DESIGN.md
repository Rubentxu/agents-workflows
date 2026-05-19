# DESIGN.md — Control Plane de Workflows Agénticos

**Proyecto:** `Studio / app`  
**Documento:** Especificación visual y de interacción  
**Estado:** Propuesta inicial  
**Versión:** `0.1.0`  
**Ámbito:** Dashboard, navegación principal, estados vacíos, estados de error, modo claro y modo oscuro.

---

## 1. Objetivo

Este documento define la propuesta de diseño profesional para el **Control Plane de Workflows Agénticos** mostrado en el dashboard de `Studio / app`.

El objetivo es evolucionar la interfaz actual hacia un producto SaaS moderno, claro y escalable, alineado con buenas prácticas de **Material Design 3**, diseño basado en **tokens**, accesibilidad, jerarquía visual, consistencia entre modos claro/oscuro y estados operativos comprensibles para usuarios técnicos.

La interfaz debe permitir supervisar, diseñar y operar workflows, agentes, skills, prompts, tools, ejecuciones, métricas, artefactos y alertas desde una experiencia coherente y preparada para entornos de producción.

---

## 2. Principios de diseño

### 2.1 Claridad operativa

El usuario debe entender el estado del sistema en menos de cinco segundos:

- Qué proyecto está viendo.
- Qué workspace está activo.
- Si el sistema está conectado.
- Si existen ejecuciones recientes.
- Si hay workflows disponibles.
- Si hay errores de API, alertas o datos no disponibles.

La interfaz debe evitar contenedores vacíos sin explicación. Todo estado vacío o error debe tener mensaje, causa probable y acción disponible.

### 2.2 Jerarquía visual

La pantalla debe organizarse por importancia:

1. Navegación global.
2. Contexto de proyecto/workspace.
3. KPIs operativos.
4. Bloques de trabajo: workspaces, ejecuciones, catálogo de workflows.
5. Acciones primarias: crear workflow, refrescar, reintentar, ver ejecuciones.

### 2.3 Consistencia

El sistema debe usar patrones repetibles:

- Misma estructura para tarjetas.
- Misma posición para títulos, iconos y acciones.
- Mismos estados visuales para éxito, error, alerta, información y neutral.
- Misma nomenclatura en todo el producto.

### 2.4 Accesibilidad

La interfaz debe diseñarse para teclado, lectores de pantalla, contraste suficiente y foco visible.

Requisitos mínimos:

- Navegación completa por teclado.
- Estados `focus-visible` claros.
- Contraste AA como mínimo.
- No depender solo del color para comunicar estados.
- Textos alternativos en iconografía informativa.
- Landmarks semánticos: `header`, `nav`, `main`, `section`, `aside`.
- Targets interactivos de al menos `40x40 px`; recomendado `48x48 px`.

### 2.5 Escalabilidad

El diseño debe soportar crecimiento:

- Muchos workspaces.
- Muchos workflows.
- Ejecuciones concurrentes.
- Alertas de diferente severidad.
- Filtros avanzados.
- Integraciones externas.
- Datos en streaming.

La pantalla inicial debe funcionar bien tanto en estado vacío como en entornos con mucha actividad.

### 2.6 Profesionalidad visual

La interfaz debe transmitir fiabilidad de plataforma:

- Menos ruido visual.
- Mejor uso del espacio.
- Tarjetas con bordes suaves.
- Iconografía consistente.
- Colores semánticos.
- Estados vacíos ilustrados de forma sobria.
- Microinteracciones sutiles.
- Buen equilibrio entre densidad de información y legibilidad.

---

## 3. Referencias de diseño

Esta especificación se inspira en los siguientes criterios de diseño:

- **Material Design 3** como sistema base de estilos, componentes, color, tipografía y tokens.
- **Material Design tokens** para desacoplar decisiones visuales de la implementación.
- **Material color roles** para asegurar equivalencia entre modo claro y oscuro.
- **Material accessibility foundations** y WCAG como base de accesibilidad.
- **Patrones de producto SaaS enterprise**: dashboard, control plane, observabilidad, empty states, error states y navegación lateral persistente.

---

## 4. Arquitectura visual de la pantalla

### 4.1 Layout general

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Top App Bar                                                         │
├───────────────┬─────────────────────────────────────────────────────┤
│ Sidebar       │ Main content                                        │
│ Navigation    │                                                     │
│               │ Header / Context                                    │
│               │ KPI cards                                           │
│               │ Workspaces panel                                    │
│               │ Recent Agent Executions panel                       │
│               │ Workflow Catalog panel                              │
│               │ Footer optional                                     │
└───────────────┴─────────────────────────────────────────────────────┘
```

### 4.2 Regiones

| Región | Función | Comportamiento |
|---|---|---|
| Top App Bar | Contexto global, búsqueda, estado de conexión, notificaciones | Fija en desktop |
| Sidebar | Navegación principal agrupada por dominio | Colapsable |
| Main Header | Título del dashboard y proyecto activo | Siempre visible |
| KPI Grid | Resumen operativo de estado | Responsive |
| Content Panels | Workspaces, ejecuciones, catálogo | Tarjetas con estados |
| Footer | Docs, API Reference, soporte | Opcional, bajo contenido |

---

## 5. Navegación

### 5.1 Sidebar

La navegación se divide por dominios:

```text
OVERVIEW
- Dashboard

DESIGN
- Workflows
- Agents
- Skills
- Prompts
- Tools
- Templates

OBSERVE
- Agent Executions
- Insights
- Artifacts
- Metrics
- Alerts

REGISTRY
- Resources
- Overrides
- Dependencies

ADMIN
- Workspaces
- Settings
- Integrations
```

### 5.2 Reglas de navegación

- El item activo usa color primario suave de fondo y texto primario.
- Cada sección tiene etiqueta en mayúsculas, pequeña y con tracking.
- Iconos lineales de una misma familia.
- La sidebar debe poder colapsar a solo iconos.
- En pantallas pequeñas, la sidebar se convierte en drawer.

### 5.3 Estados de navegación

| Estado | Visual |
|---|---|
| Default | Texto secundario, icono neutral |
| Hover | Fondo sutil |
| Active | Fondo `primaryContainer`, texto `onPrimaryContainer` |
| Focus | Outline visible |
| Disabled | Opacidad reducida, sin interacción |

---

## 6. Top App Bar

### 6.1 Elementos

De izquierda a derecha:

1. Logo `Studio`.
2. Breadcrumb: `Studio / app`.
3. Selector de workspace.
4. Búsqueda global.
5. Notificaciones.
6. Estado de conexión.
7. Menú de usuario, opcional.

### 6.2 Búsqueda

Placeholder recomendado:

```text
Search workflows, agents, executions...
```

Atajo sugerido:

```text
⌘K / Ctrl+K
```

La búsqueda debe abrir un command palette con:

- Workflows.
- Agents.
- Skills.
- Prompts.
- Tools.
- Executions.
- Settings.

### 6.3 Estado de conexión

Estados:

| Estado | Texto | Indicador |
|---|---|---|
| Connected | `Connected` | Punto verde |
| Connecting | `Connecting...` | Spinner o punto animado |
| Degraded | `Degraded` | Punto ámbar |
| Disconnected | `Disconnected` | Punto rojo |

---

## 7. Dashboard Header

### 7.1 Estructura

```text
app Dashboard
Project: app
```

Acciones a la derecha:

- `Refresh`
- Opcional: `Create Workflow`
- Opcional: menú overflow

### 7.2 Reglas

- El título debe ser claro y específico.
- El proyecto se muestra como metadato.
- Las acciones primarias se sitúan a la derecha en desktop.
- En móvil, las acciones pasan debajo del título o a menú overflow.

---

## 8. KPIs operativos

### 8.1 Tarjetas propuestas

| KPI | Descripción | Estado |
|---|---|---|
| Active | Ejecuciones activas | Operativo |
| Failed | Ejecuciones fallidas | Error |
| Success Rate | Porcentaje de éxito | Éxito |
| Avg Duration | Duración media | Métrica |
| Queued | Ejecuciones en cola | Advertencia |
| Artifacts | Artefactos generados | Información |
| Open Alerts | Alertas abiertas | Crítico |

### 8.2 Estructura de una tarjeta KPI

```text
┌─────────────────────┐
│ [icon]  0           │
│         Active      │
│         optional Δ  │
└─────────────────────┘
```

### 8.3 Reglas

- Valor principal en `headlineMedium` o equivalente.
- Etiqueta en `bodySmall`.
- Icono dentro de contenedor tonal.
- Añadir tooltip para métricas ambiguas.
- Permitir skeleton mientras se cargan datos.
- No mostrar `—` sin explicación si el dato no existe.

### 8.4 Estados de KPI

| Estado | Ejemplo | Tratamiento |
|---|---|---|
| Sin datos | `0` | Neutral |
| No aplicable | `—` | Tooltip explicativo |
| Error | `!` | Mensaje contextual |
| Loading | Skeleton | Sin saltos de layout |
| Warning | `Queued > 0` | Tonal ámbar |
| Critical | `Open Alerts > 0` | Tonal rojo |

---

## 9. Panel de Workspaces

### 9.1 Objetivo

Mostrar workspaces disponibles y permitir cambiar de contexto.

### 9.2 Estados

#### Estado con datos

```text
Workspaces
[Production] [Staging] [Development]
```

Cada workspace debe mostrar:

- Nombre.
- Estado.
- Número de workflows.
- Última actividad.
- Acceso rápido.

#### Estado de error

```text
Workspace data unavailable
Unable to load workspaces due to an API error.
[Retry]
```

#### Estado vacío

```text
No workspaces yet
Create a workspace to start organizing agentic workflows.
[Create Workspace]
```

### 9.3 Tratamiento de errores

El error `API error: 404` no debe mostrarse como texto suelto centrado. Debe representarse como un estado de error contextual con:

- Icono de advertencia.
- Título humano.
- Descripción breve.
- Botón `Retry`.
- Opción secundaria `View details`.

---

## 10. Panel de ejecuciones recientes

### 10.1 Objetivo

Mostrar actividad reciente de agentes y workflows.

### 10.2 Estado vacío recomendado

```text
No agent executions yet
Agent executions will appear here once they are run.
[View Agent Executions]
```

### 10.3 Estado con datos

Columnas recomendadas:

| Columna | Contenido |
|---|---|
| Execution | Nombre o ID corto |
| Agent | Agente responsable |
| Workflow | Workflow asociado |
| Status | Running, Success, Failed, Queued |
| Duration | Tiempo |
| Started | Fecha relativa |
| Actions | Ver detalle, logs, artifacts |

### 10.4 Estados de ejecución

| Estado | Color semántico | Icono |
|---|---|---|
| Running | Primary | Spinner / play |
| Success | Success | Check |
| Failed | Error | X |
| Queued | Warning | Clock |
| Cancelled | Neutral | Stop |
| Unknown | Neutral | Help |

---

## 11. Catálogo de workflows

### 11.1 Objetivo

Permitir descubrir, crear y abrir workflows.

### 11.2 Estado vacío recomendado

```text
No workflows found
Create your first workflow to get started.
[Create Workflow]
```

### 11.3 Estado con datos

Formato recomendado: tabla o cards compactas.

Campos:

- Nombre.
- Descripción corta.
- Estado.
- Última ejecución.
- Success rate.
- Owner.
- Tags.
- Acciones.

### 11.4 Acción primaria

El botón `Create Workflow` debe ser la acción principal del estado vacío.

---

## 12. Sistema de diseño

## 12.1 Tokens

El diseño debe definirse con tokens semánticos, no con valores hardcodeados.

### 12.1.1 Familias de tokens

```text
color.*
typography.*
space.*
radius.*
elevation.*
motion.*
border.*
icon.*
zIndex.*
```

### 12.1.2 Ejemplo de tokens

```yaml
color:
  primary: var(--color-primary)
  onPrimary: var(--color-on-primary)
  primaryContainer: var(--color-primary-container)
  onPrimaryContainer: var(--color-on-primary-container)
  surface: var(--color-surface)
  surfaceContainer: var(--color-surface-container)
  surfaceContainerHigh: var(--color-surface-container-high)
  outline: var(--color-outline)
  error: var(--color-error)
  warning: var(--color-warning)
  success: var(--color-success)

radius:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px

space:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
```

---

## 13. Color

## 13.1 Modo claro

```css
:root,
[data-theme="light"] {
  --color-primary: #2563EB;
  --color-on-primary: #FFFFFF;
  --color-primary-container: #DBEAFE;
  --color-on-primary-container: #1E3A8A;

  --color-secondary: #64748B;
  --color-on-secondary: #FFFFFF;
  --color-secondary-container: #E2E8F0;
  --color-on-secondary-container: #0F172A;

  --color-success: #16A34A;
  --color-success-container: #DCFCE7;
  --color-on-success-container: #14532D;

  --color-warning: #F59E0B;
  --color-warning-container: #FEF3C7;
  --color-on-warning-container: #78350F;

  --color-error: #DC2626;
  --color-error-container: #FEE2E2;
  --color-on-error-container: #7F1D1D;

  --color-info: #0EA5E9;
  --color-info-container: #E0F2FE;
  --color-on-info-container: #075985;

  --color-background: #F8FAFC;
  --color-on-background: #0F172A;

  --color-surface: #FFFFFF;
  --color-on-surface: #0F172A;

  --color-surface-container-lowest: #FFFFFF;
  --color-surface-container-low: #F8FAFC;
  --color-surface-container: #F1F5F9;
  --color-surface-container-high: #E2E8F0;
  --color-surface-container-highest: #CBD5E1;

  --color-outline: #CBD5E1;
  --color-outline-variant: #E2E8F0;

  --color-shadow: rgba(15, 23, 42, 0.08);
  --color-scrim: rgba(15, 23, 42, 0.48);
}
```

### 13.2 Modo oscuro

```css
[data-theme="dark"] {
  --color-primary: #8AB4F8;
  --color-on-primary: #0B1B33;
  --color-primary-container: #174EA6;
  --color-on-primary-container: #D2E3FC;

  --color-secondary: #94A3B8;
  --color-on-secondary: #0F172A;
  --color-secondary-container: #334155;
  --color-on-secondary-container: #E2E8F0;

  --color-success: #34A853;
  --color-success-container: #123D24;
  --color-on-success-container: #C8F7D2;

  --color-warning: #FDD663;
  --color-warning-container: #4A3400;
  --color-on-warning-container: #FFE8A3;

  --color-error: #F28B82;
  --color-error-container: #5F1B18;
  --color-on-error-container: #FAD2CF;

  --color-info: #7DD3FC;
  --color-info-container: #0C4A6E;
  --color-on-info-container: #E0F2FE;

  --color-background: #121212;
  --color-on-background: #E5E7EB;

  --color-surface: #1E1E1E;
  --color-on-surface: #E5E7EB;

  --color-surface-container-lowest: #0F1115;
  --color-surface-container-low: #171A1F;
  --color-surface-container: #1E1E1E;
  --color-surface-container-high: #252A31;
  --color-surface-container-highest: #303641;

  --color-outline: #3F4652;
  --color-outline-variant: #2B3038;

  --color-shadow: rgba(0, 0, 0, 0.40);
  --color-scrim: rgba(0, 0, 0, 0.64);
}
```

### 13.3 Reglas de color

- Los colores de estado deben ser semánticos, no decorativos.
- `primary` se reserva para acciones principales y navegación activa.
- `error` se usa para fallos reales, no para simple ausencia de datos.
- `warning` se usa para degradación, colas o estados que requieren atención.
- El modo oscuro no debe ser una simple inversión de colores.
- Los contenedores tonales deben reducir fatiga visual y mantener contraste.

---

## 14. Tipografía

### 14.1 Fuente recomendada

Preferencia:

```text
Inter, Roboto, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Si se quiere máxima alineación con Google, usar `Roboto` o `Google Sans` donde esté permitido por licencia y disponibilidad.

### 14.2 Escala tipográfica

| Token | Size | Line height | Weight | Uso |
|---|---:|---:|---:|---|
| displaySmall | 36px | 44px | 600 | Grandes pantallas |
| headlineLarge | 32px | 40px | 600 | Títulos principales |
| headlineMedium | 28px | 36px | 600 | KPIs destacados |
| titleLarge | 22px | 28px | 600 | Títulos de página |
| titleMedium | 16px | 24px | 600 | Títulos de tarjeta |
| bodyLarge | 16px | 24px | 400 | Texto principal |
| bodyMedium | 14px | 20px | 400 | Texto UI |
| bodySmall | 12px | 16px | 400 | Metadatos |
| labelLarge | 14px | 20px | 600 | Botones |
| labelMedium | 12px | 16px | 600 | Chips, nav labels |
| labelSmall | 11px | 16px | 600 | Secciones de sidebar |

### 14.3 Reglas

- No usar tamaños inferiores a `11px`.
- Usar máximo tres pesos visuales: `400`, `500/600`, `700`.
- Las métricas principales deben tener alto contraste.
- El texto secundario debe conservar contraste suficiente.

---

## 15. Espaciado

### 15.1 Grid base

Usar grid de `4px`, con composición preferente en múltiplos de `8px`.

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

### 15.2 Reglas

| Elemento | Espaciado |
|---|---:|
| Padding de página | 24px desktop, 16px tablet, 12px móvil |
| Gap entre KPI cards | 16px |
| Padding de tarjeta | 16px / 20px |
| Gap entre secciones | 24px |
| Sidebar width | 256px |
| Top bar height | 64px |
| KPI card min-height | 96px |
| Panel min-height | 180px |

---

## 16. Forma y bordes

### 16.1 Radio

| Token | Valor | Uso |
|---|---:|---|
| radius.xs | 4px | Badges pequeños |
| radius.sm | 8px | Inputs, chips |
| radius.md | 12px | Botones, cards pequeñas |
| radius.lg | 16px | Panels |
| radius.xl | 20px | Contenedores grandes |

### 16.2 Bordes

```css
--border-subtle: 1px solid var(--color-outline-variant);
--border-default: 1px solid var(--color-outline);
--border-strong: 1px solid color-mix(in srgb, var(--color-outline) 80%, var(--color-on-surface));
```

---

## 17. Elevación

### 17.1 Tokens

```css
--elevation-0: none;
--elevation-1: 0 1px 2px var(--color-shadow);
--elevation-2: 0 4px 12px var(--color-shadow);
--elevation-3: 0 8px 24px var(--color-shadow);
```

### 17.2 Reglas

- Usar elevación baja por defecto.
- Evitar sombras fuertes en modo oscuro.
- En modo oscuro, diferenciar capas con color de superficie más que con sombra.
- Los paneles principales usan `elevation-1`.
- Menús, popovers y command palette usan `elevation-3`.

---

## 18. Componentes clave

## 18.1 App Shell

Responsabilidades:

- Renderizar top bar.
- Renderizar sidebar.
- Gestionar colapso.
- Reservar `main` para contenido.
- Aplicar tema.

Estados:

- Sidebar expanded.
- Sidebar collapsed.
- Mobile drawer.
- Loading shell.
- Offline shell.

## 18.2 Button

Variantes:

| Variante | Uso |
|---|---|
| Primary | Acción principal: `Create Workflow` |
| Secondary | Acción alternativa |
| Tonal | Acciones dentro de cards |
| Ghost | Navegación o acciones secundarias |
| Danger | Acciones destructivas |
| Icon | Refresh, Retry, Notifications |

Estados:

- Default.
- Hover.
- Active.
- Focus.
- Disabled.
- Loading.

## 18.3 Card

Tipos:

- KPI Card.
- Panel Card.
- Empty State Card.
- Error State Card.
- Workflow Card.
- Execution Row/Card.

Reglas:

- Siempre título claro.
- Icono opcional.
- Acción contextual si procede.
- Sin tarjetas vacías.

## 18.4 Empty State

Estructura:

```text
[Illustration/Icon]
Title
Description
[Primary action]
[Optional secondary action]
```

Reglas:

- No culpar al usuario.
- Explicar qué ocurrirá cuando haya datos.
- Ofrecer acción si existe.
- Mantener tono técnico pero humano.

## 18.5 Error State

Estructura:

```text
[Warning icon]
Human-readable title
Short explanation
[Retry] [View details]
```

Ejemplo:

```text
Workspace data unavailable
Unable to load workspaces due to an API error.
Retry
```

Reglas:

- Mostrar detalles técnicos solo bajo demanda.
- Incluir código de error en `View details`.
- Permitir reintento.
- Registrar el error internamente.

## 18.6 Notification Bell

Estados:

| Estado | Visual |
|---|---|
| Sin notificaciones | Icono neutral |
| Con notificaciones | Badge |
| Críticas | Badge rojo |
| Loading | Skeleton o spinner pequeño |

## 18.7 Workspace Selector

Debe mostrar:

- Workspace activo.
- Lista de workspaces.
- Acción `Create workspace`.
- Estado de carga.
- Estado de error.

---

## 19. Modo claro

### 19.1 Objetivo visual

El modo claro debe sentirse limpio, profesional y espacioso.

Características:

- Fondo general gris muy claro.
- Tarjetas blancas.
- Bordes suaves.
- Color primario azul.
- Estados semánticos con contenedores tonales.
- Separación clara entre navegación y contenido.

### 19.2 Aplicación por región

| Región | Fondo | Borde | Elevación |
|---|---|---|---|
| Top App Bar | `surface` | `outline-variant` | `elevation-0` |
| Sidebar | `surface` | `outline-variant` | `elevation-0` |
| Main | `background` | none | none |
| KPI Card | `surface` | `outline-variant` | `elevation-1` |
| Panel | `surface` | `outline-variant` | `elevation-1` |
| Empty State | `surface` | none | none |
| Error State | `warning-container` / `error-container` | tonal | none |

### 19.3 CSS base

```css
[data-theme="light"] body {
  background: var(--color-background);
  color: var(--color-on-background);
}

[data-theme="light"] .app-shell__sidebar,
[data-theme="light"] .app-shell__topbar {
  background: var(--color-surface);
  border-color: var(--color-outline-variant);
}

[data-theme="light"] .card {
  background: var(--color-surface);
  border: 1px solid var(--color-outline-variant);
  box-shadow: var(--elevation-1);
}
```

---

## 20. Modo oscuro

### 20.1 Objetivo visual

El modo oscuro debe reducir fatiga visual sin perder jerarquía ni contraste.

Características:

- Fondo base `#121212`.
- Superficies elevadas ligeramente más claras.
- Bordes visibles pero discretos.
- Colores semánticos menos saturados.
- Sombras mínimas.
- Uso de contenedores tonales para estados.

### 20.2 Aplicación por región

| Región | Fondo | Borde | Elevación |
|---|---|---|---|
| Top App Bar | `surface-container-low` | `outline-variant` | `elevation-0` |
| Sidebar | `surface-container-low` | `outline-variant` | `elevation-0` |
| Main | `background` | none | none |
| KPI Card | `surface-container` | `outline-variant` | none |
| Panel | `surface-container` | `outline-variant` | none |
| Empty State | `surface-container` | none | none |
| Error State | `error-container` / `warning-container` | tonal | none |

### 20.3 Reglas específicas para dark mode

- No usar blanco puro para texto principal; usar `#E5E7EB`.
- No usar negro puro salvo en scrims.
- Evitar sombras visibles intensas.
- Aumentar el contraste de bordes en cards.
- Usar overlays o superficies elevadas para distinguir capas.
- Reducir saturación de rojo, verde, azul y amarillo.
- Mantener foco visible con azul claro.

### 20.4 CSS base

```css
[data-theme="dark"] body {
  background: var(--color-background);
  color: var(--color-on-background);
}

[data-theme="dark"] .app-shell__sidebar,
[data-theme="dark"] .app-shell__topbar {
  background: var(--color-surface-container-low);
  border-color: var(--color-outline-variant);
}

[data-theme="dark"] .card {
  background: var(--color-surface-container);
  border: 1px solid var(--color-outline-variant);
  box-shadow: none;
}

[data-theme="dark"] .card:hover {
  background: var(--color-surface-container-high);
}
```

---

## 21. Responsive design

### 21.1 Breakpoints

```css
--breakpoint-sm: 640px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--breakpoint-xl: 1280px;
--breakpoint-2xl: 1536px;
```

### 21.2 Desktop

- Sidebar fija.
- Top bar fija.
- KPI grid de 7 columnas si hay espacio.
- Paneles en layout de 2 columnas cuando proceda.
- Catálogo a ancho completo.

### 21.3 Tablet

- Sidebar colapsable.
- KPI grid de 2-3 columnas.
- Paneles apilados.
- Búsqueda puede compactarse.

### 21.4 Móvil

- Sidebar como drawer.
- Top bar simplificada.
- KPI cards en una columna o carrusel horizontal.
- Tablas convertidas en cards.
- Acciones principales visibles al inicio.

---

## 22. Estados de carga

### 22.1 Skeletons

Usar skeletons para:

- KPIs.
- Lista de workspaces.
- Ejecuciones recientes.
- Workflow catalog.

### 22.2 Reglas

- No usar spinners globales salvo en arranque inicial.
- Mantener altura de contenedores para evitar layout shift.
- Mostrar datos parciales si están disponibles.
- Diferenciar `loading`, `empty` y `error`.

---

## 23. Motion

### 23.1 Principios

- Movimiento rápido y sutil.
- No bloquear al usuario.
- Respetar `prefers-reduced-motion`.

### 23.2 Duraciones

```css
--motion-fast: 120ms;
--motion-normal: 180ms;
--motion-slow: 240ms;
--motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
```

### 23.3 Usos

| Interacción | Motion |
|---|---|
| Hover card | 120ms |
| Sidebar collapse | 180ms |
| Drawer open | 240ms |
| Toast | 180ms |
| Skeleton shimmer | Desactivable |

---

## 24. Accesibilidad

### 24.1 Teclado

Requisitos:

- `Tab` recorre controles interactivos.
- `Enter` activa botones.
- `Esc` cierra drawers, popovers y command palette.
- `Arrow keys` en menús y listas.
- `Ctrl+K / Cmd+K` abre búsqueda global.
- Foco siempre visible.

### 24.2 Lectores de pantalla

- El estado de conexión debe anunciarse.
- Los contadores de KPI deben tener `aria-label`.
- Los errores deben usar `role="alert"` cuando sean críticos.
- Los estados de carga largos deben usar `aria-busy`.
- Las regiones principales deben tener labels.

Ejemplo:

```html
<section aria-labelledby="kpi-summary-title">
  <h2 id="kpi-summary-title">Operational summary</h2>
</section>
```

### 24.3 Contraste

- Texto principal: contraste mínimo AA.
- Texto secundario: contraste suficiente sobre superficie.
- Iconos informativos: no depender solo de color.
- Badges de estado: color + texto + icono.

---

## 25. Contenido y microcopy

### 25.1 Tono

El tono debe ser:

- Claro.
- Técnico.
- Humano.
- Directo.
- No alarmista.

### 25.2 Ejemplos

| Caso | Texto recomendado |
|---|---|
| Sin ejecuciones | `No agent executions yet` |
| Sin workflows | `No workflows found` |
| Error API | `Workspace data unavailable` |
| Reintento | `Retry` |
| Crear workflow | `Create Workflow` |
| Ver ejecuciones | `View Agent Executions` |
| Conectado | `Connected` |
| Degradado | `Degraded` |

### 25.3 Evitar

- `API error: 404` como único mensaje visible.
- `No data` sin contexto.
- Mensajes excesivamente técnicos.
- Colores de error para estados vacíos normales.

---

## 26. Propuesta de estructura de componentes

```text
src/
  app/
    AppShell.tsx
    routes/
      DashboardPage.tsx
  components/
    navigation/
      Sidebar.tsx
      SidebarSection.tsx
      SidebarItem.tsx
      TopBar.tsx
      Breadcrumb.tsx
      WorkspaceSelector.tsx
    dashboard/
      KpiGrid.tsx
      KpiCard.tsx
      WorkspacesPanel.tsx
      RecentExecutionsPanel.tsx
      WorkflowCatalogPanel.tsx
    states/
      EmptyState.tsx
      ErrorState.tsx
      LoadingState.tsx
    primitives/
      Button.tsx
      Card.tsx
      Badge.tsx
      IconButton.tsx
      Tooltip.tsx
      Input.tsx
  design-system/
    tokens.css
    themes.css
    typography.css
    elevation.css
    motion.css
```

---

## 27. CSS de referencia

### 27.1 App shell

```css
.app-shell {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: 256px 1fr;
  grid-template-rows: 64px 1fr;
  background: var(--color-background);
  color: var(--color-on-background);
}

.app-shell__topbar {
  grid-column: 1 / -1;
  height: 64px;
  border-bottom: 1px solid var(--color-outline-variant);
}

.app-shell__sidebar {
  grid-row: 2;
  border-right: 1px solid var(--color-outline-variant);
}

.app-shell__main {
  grid-row: 2;
  padding: 24px;
  overflow: auto;
}
```

### 27.2 KPI grid

```css
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(140px, 1fr));
  gap: 16px;
}

.kpi-card {
  min-height: 96px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-outline-variant);
  box-shadow: var(--elevation-1);
}

@media (max-width: 1280px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(160px, 1fr));
  }
}

@media (max-width: 768px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
```

### 27.3 Panel card

```css
.panel-card {
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  border: 1px solid var(--color-outline-variant);
  box-shadow: var(--elevation-1);
  padding: 20px;
}

.panel-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
```

### 27.4 Empty state

```css
.empty-state {
  min-height: 180px;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 32px;
}

.empty-state__title {
  font: var(--typography-title-medium);
  color: var(--color-on-surface);
}

.empty-state__description {
  max-width: 440px;
  color: var(--color-secondary);
}
```

### 27.5 Error state

```css
.error-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--color-warning-container);
  color: var(--color-on-warning-container);
  border: 1px solid color-mix(in srgb, var(--color-warning) 40%, transparent);
}
```

---

## 28. Criterios de aceptación

### 28.1 Visual

- La pantalla no debe parecer wireframe.
- La jerarquía entre topbar, sidebar, KPIs y panels debe ser evidente.
- Los estados vacíos deben incluir acción clara.
- Los errores deben estar contextualizados.
- El modo claro y oscuro deben tener equivalencia funcional.

### 28.2 Interacción

- `Refresh` actualiza KPIs y panels.
- `Retry` reintenta la carga del panel afectado.
- `Create Workflow` abre flujo de creación.
- `View Agent Executions` navega al listado.
- Selector de workspace cambia contexto.
- Búsqueda global abre command palette.

### 28.3 Accesibilidad

- Todo es usable con teclado.
- El foco es visible.
- Los estados se anuncian correctamente.
- El contraste cumple AA.
- No hay información transmitida solo por color.

### 28.4 Responsive

- Desktop: layout completo.
- Tablet: sidebar colapsable, panels apilados.
- Móvil: drawer, KPIs en una columna, tablas como cards.

### 28.5 Tema

- Existe `data-theme="light"`.
- Existe `data-theme="dark"`.
- No hay colores hardcodeados en componentes.
- Los tokens semánticos gobiernan toda la UI.

---

## 29. Roadmap de mejora visual

### Fase 1 — Foundation

- Introducir tokens CSS.
- Crear modo claro y oscuro.
- Refactorizar layout base.
- Mejorar sidebar.
- Mejorar tarjetas KPI.

### Fase 2 — Estados

- Implementar empty states.
- Implementar error states.
- Implementar skeleton loading.
- Añadir `Retry` y `View details`.

### Fase 3 — Interacción

- Command palette.
- Workspace selector avanzado.
- Filtros en ejecuciones.
- Acciones rápidas en workflows.

### Fase 4 — Observabilidad

- Gráficas de ejecución.
- Timeline de agentes.
- Logs embebidos.
- Alertas agrupadas por severidad.
- Panel de health del sistema.

---

## 30. Checklist de implementación

```text
[ ] Crear tokens globales
[ ] Crear tema claro
[ ] Crear tema oscuro
[ ] Aplicar AppShell
[ ] Rediseñar sidebar
[ ] Rediseñar topbar
[ ] Crear KpiCard
[ ] Crear KpiGrid
[ ] Crear EmptyState
[ ] Crear ErrorState
[ ] Crear LoadingState
[ ] Rediseñar WorkspacesPanel
[ ] Rediseñar RecentExecutionsPanel
[ ] Rediseñar WorkflowCatalogPanel
[ ] Añadir responsive layout
[ ] Añadir navegación por teclado
[ ] Añadir roles ARIA
[ ] Validar contraste
[ ] Validar modo oscuro
[ ] Validar estados con datos reales
```

---

## 31. Notas de implementación para frameworks

### 31.1 React

- Usar componentes pequeños y composables.
- Mantener tokens en CSS o Tailwind theme.
- Evitar lógica de negocio en componentes visuales.
- Separar estados `loading`, `error`, `empty`, `ready`.

### 31.2 Tailwind

Ejemplo de mapping:

```js
theme: {
  extend: {
    colors: {
      primary: "var(--color-primary)",
      surface: "var(--color-surface)",
      background: "var(--color-background)",
      error: "var(--color-error)",
      warning: "var(--color-warning)",
      success: "var(--color-success)"
    },
    borderRadius: {
      md: "var(--radius-md)",
      lg: "var(--radius-lg)",
      xl: "var(--radius-xl)"
    },
    boxShadow: {
      1: "var(--elevation-1)",
      2: "var(--elevation-2)",
      3: "var(--elevation-3)"
    }
  }
}
```

### 31.3 Web Components

- Exponer tokens como CSS custom properties.
- Encapsular componentes sin bloquear theming.
- Propagar `data-theme` desde el host.

---

## 32. Resultado esperado

La nueva pantalla del Control Plane debe percibirse como una consola profesional de operación para sistemas agénticos:

- Más clara.
- Más moderna.
- Más confiable.
- Más usable.
- Preparada para producción.
- Compatible con modo claro y oscuro.
- Alineada con un sistema de diseño basado en tokens.

---

## 33. Referencias

- Material Design 3: https://m3.material.io/
- Material Design 3 — Design tokens: https://m3.material.io/foundations/design-tokens
- Material Design 3 — Color roles: https://m3.material.io/styles/color/roles
- Material Design 3 — Typography: https://m3.material.io/styles/typography/overview
- Material Design 3 — Accessibility: https://m3.material.io/foundations/overview/principles
- Material Design 3 — Designing accessibility: https://m3.material.io/foundations/designing
- W3C WCAG overview: https://www.w3.org/WAI/standards-guidelines/wcag/
