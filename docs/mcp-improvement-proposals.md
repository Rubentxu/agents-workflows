# Propuestas de Mejora — MCP Server & Desarrollo de Tools

Basado en la investigación de MCP best practices, official documentation, y análisis del código actual.

---

## Diagnóstico Rápido

### Lo que ya funciona bien
- Streamable HTTP transport correctamente implementado
- Servicio systemd para background daemon
- Registro en opencode como remote MCP
- ~30 tools funcionales con CRUD completo
- Studio UI + REST API + MCP在同一 servidor

### Lo que falta (brechas detectadas)
- Tools no tienen `outputSchema` — el cliente MCP no sabe qué esperar como respuesta
- No hay un playground interactivo para probar tools en desarrollo
- No hay tests a nivel de protocolo MCP (solo REST API + UI)
- Las descripciones de tools son genéricas ("Execute a workflow", "Get an agent")
- Los schemas de input no tienen descripciones por campo ni ejemplos
- Falta tool-level telemetry/observabilidad
- No hay generación automática de clientes/stubs desde los schemas

---

## Propuestas

### P1 — MCP Playground (browser-based tool tester)

**Qué:** Una SPA minimalista que se sirve desde el mismo servidor (ruta `/playground`) y permite:
- Listar todos los tools con sus schemas
- Invocar cualquier tool desde un formulario generado del schema
- Ver el response JSON-RPC en crudo
- Historial de invocaciones recientes

**Por qué:** Hoy no hay forma de probar un tool MCP sin tener opencode o curl con el JSON-RPC exacto. Esto acelera el desarrollo 10x.

**Cómo:**
```html
GET /playground -> HTML+JS que usa fetch() contra POST /mcp
```
El frontend es un HTML estático sin build step. Usa el endpoint `tools/list` para auto-descubrir los tools y generar formularios dinámicos.

**Beneficio lateral:** Sirve como documentación viva de la API MCP.

---

### P1 — Output Schema para todos los tools

**Qué:** Cada `Tool::new(...)` incluye un `outputSchema` que describe la forma de la respuesta.

**Por qué:** El MCP spec soporta `outputSchema` desde 2025-06-18. Sin esto:
- opencode no puede tipar las respuestas
- No se pueden generar clientes tipados
- La experiencia de desarrollo es peor (strings opacos)

**Cómo:**
```rust
Tool::new(TOOL_WORKFLOW_LIST, "List workflows", empty_schema())
    .with_output_schema(json!({
        "type": "array",
        "items": { "$ref": "#/definitions/WorkflowSummary" }
    }))
```

Hay que crear un `WorkflowSummary`, `AgentSummary`, etc. con `serde::Serialize` y extraer el schema con `schemars` o similar.

---

### P2 — `just tool` CLI interactivo

**Qué:** Un comando `just tool` que abre un REPL para probar tools MCP desde terminal.

**Por qué:** Para desarrollo rápido sin abrir el browser. Útil cuando estás en SSH/tmux.

**Cómo:**
```bash
just tool          # lista tools disponibles (numbered)
just tool 3        # tool #3 con formulario interactivo
just tool list     # igual que just tool
just tool call workflow_get '{"arn": "..."}'  # directo
```

Implementado con un script bash que hace `curl` contra `POST /mcp` con el JSON-RPC correcto.

**Ejemplo de sesión:**
```
$ just tool

Tools disponibles:
 1) workflow_list      — List all registered workflows
 2) workflow_get       — Get a workflow by ARN
 3) agent_list         — List all agents
 ...

Selecciona un número (o 'q' para salir): 2

Parámetros para workflow_get:
  arn: arn:local:global:workflow/mi-workflow

Respuesta:
 {
   "name": "mi-workflow",
   "stages": [...]
 }
```

---

### P2 — Tests de protocolo MCP (Playwright + fixtures)

**Qué:** Tests que hablan MCP protocol directamente (no REST, no UI).

**Por qué:** Hoy los tests verifican REST API o UI. Nadie verifica que el protocolo MCP funcione correctamente: que los JSON-RPC tengan la forma esperada, que los errores se devuelvan con `isError`, que `tools/list` devuelva todo.

**Cómo:**
```typescript
// tests/mcp/tools.spec.ts
test('workflow_list returns array of workflows', async () => {
  const result = await callMcpTool('workflow_list', {});
  expect(result.isError).toBeFalsy();
  expect(Array.isArray(result.content)).toBe(true);
});

test('workflow_get with bad ARN returns error', async () => {
  const result = await callMcpTool('workflow_get', { arn: 'invalid' });
  expect(result.isError).toBe(true);
});
```

**Helper:**
```typescript
async function callMcpTool(name: string, args: object) {
  const resp = await fetch('http://localhost:8080/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const body = await resp.json();
  return body.result;
}
```

---

### P2 — Tool Discovery con Progressive Loading

**Qué:** Implementar el patrón de Progressive Discovery del MCP spec.

**Por qué:** Con 30+ tools, cargar todas las definiciones en el contexto del LLM cada vez es wasteful. El spec recomienda progressive loading para servidores con muchos tools.

**Cómo:** Añadir tres meta-tools que el cliente MCP (opencode) puede usar en lugar de cargar todo:
```rust
// Capa 1: Búsqueda
Tool::new(TOOL_SEARCH, "Search available tools by description",
    get_schema(&["query"]))

// Capa 2: Inspección detallada
Tool::new(TOOL_INSPECT, "Get full schema + examples for a tool",
    get_schema(&["tool_name"]))

// Capa 3: Ejecución directa
// ya existe como tools/call
```

Esto cambia cómo opencode descubre tools: en vez de `tools/list` masivo, usa `tool_search` para encontrar lo que necesita y `tool_inspect` para obtener el schema completo solo de ese tool.

---

### P3 — Seed Data por Tool para Tests

**Qué:** Seeds con nombres predecibles para cada tipo de recurso.

**Por qué:** Hoy los tests crean recursos con nombres aleatorios (`e2e-agent-save-1779794503576-mkdyn4`). Tener seeds fijos permite tests deterministas.

**Cómo:**
```bash
just seed        # Crea: workflow "test-demo-pipeline", agent "test-orchestrator", etc.
just seed --full # Crea dataset completo para demo
```

Los seeds se registran con ARNs fijas: `arn:local:global:workflow/test-demo-pipeline`.

---

### P3 — Tool Telemetry embebida

**Qué:** Cada tool call registra métricas: quién la llamó, cuánto tardó, error rate.

**Por qué:** Hoy no hay visibilidad de qué tools se usan, con qué frecuencia, o si fallan.

**Cómo:** Ya existe `MetricsBroadcaster` en el código. Conectarlo al dispatch de tools para emitir métricas por tool:
```rust
// en call_tool_internal
let start = Instant::now();
let result = self.call(name, args).await;
metrics.record_tool_call(name, start.elapsed(), result.is_ok());
```

Esto habilita dashboards en vivo vía el endpoint SSE de métricas.

---

### P3 — inputSchema con descripciones por campo

**Qué:** Los schemas actuales solo tienen `type: "object"` y `required`. Sin descripciones ni ejemplos.

**Por qué:** Sin descripciones, el LLM no sabe qué poner en cada campo. Termina inventando valores.

**Cómo:**
```rust
fn get_schema_with_desc(fields: &[(&str, &str, &str)]) -> JsonObject {
    // (name, description, example)
    json!({
        "type": "object",
        "properties": {
            "arn": {
                "type": "string",
                "description": "ARN del recurso, ej: arn:local:global:workflow/mi-workflow",
                "examples": ["arn:local:global:workflow/demo-pipeline"]
            }
        },
        "required": ["arn"]
    })
}
```

---

## Mapa de Implementación

| # | Propuesta | Esfuerzo | Impacto | Dependencias |
|---|-----------|----------|---------|--------------|
| 1 | MCP Playground | 1 día | Alto | Ninguna |
| 2 | Output schemas | 2-3 días | Alto | schemars crate |
| 3 | `just tool` CLI | 4 horas | Medio | Ninguna |
| 4 | Tests protocolo MCP | 2 días | Alto | Playwright + fixtures |
| 5 | Progressive discovery | 3 días | Medio | Diseño de meta-tools |
| 6 | Seed data fija | 1 día | Medio | Ninguna |
| 7 | Tool telemetry | 1 día | Bajo | MetricsBroadcaster |
| 8 | Input schemas ricos | 1 día | Medio | Refactor get_schema |

---

## Recomendación

Arrancar por **1 + 3 + 4** en ese orden:
1. **MCP Playground** — te da visibilidad inmediata de todos los tools
2. **`just tool` CLI** — testing rápido desde terminal
3. **Tests de protocolo MCP** — red de seguridad

Después **2 (output schemas)** + **8 (input schemas ricos)** como mejora de calidad.

El progressive discovery (5) vale la pena cuando el número de tools crezca >50 o cuando el servidor tenga audiencias mixtas.

---

## Pensamiento Lateral

**MCP + UI en un solo server es una ventaja que no estamos aprovechando.** El Playground puede ser una ruta más del mismo servidor web (`/playground`) y compartir autenticación con Studio. Eso lo hace trivial de desplegar: si el server está corriendo, el playground está disponible.

**Los tests de protocolo MCP deberían ser el contrato de desarrollo.** Antes de escribir un tool, se escribe el test MCP. Cuando el test pasa, el tool está listo. Esto invierte el flujo: de "escribir tool -> probar con curl" a "escribir contrato MCP -> hacerlo pasar".

**El `just tool` REPL puede generar los tests automáticamente.** Si invocas un tool y funciona, `just tool capture` puede generar el test Playwright correspondiente.
