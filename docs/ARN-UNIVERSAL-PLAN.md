# ARN Universal Plan — Agent Resource Name como Identificador Universal

**Fecha**: 2026-05-28
**Estado**: Plan aprobado — pendiente implementación
**Alcance**: Sistema completo (Studio frontend + MCP backend + Registry)

---

## 1. Contexto

El ARN (Agent Resource Name) es el sistema de identidad, resolución, almacenamiento y referencias cruzadas de toda la plataforma. Inspirado en AWS ARN.

### Formato

```
arn:local:{scope}:{type}/{name}
```

- `scope`: `global`, `project/{id}`, o `workspace/{id}`
- `type`: workflow, agent, skill, prompt, tool, template, policy, artifact, execution, insight
- `name`: slug-safe, URL-safe, inmutable una vez creado

### Principios

1. **Todo recurso tiene ARN** — Sin excepción. Workflow, Agent, Skill, Prompt, Tool, Template, Policy, Artifact, Execution, Insight.
2. **ARN = identidad** — No es un label decorativo. Determina almacenamiento, resolución, visibilidad.
3. **ARN es derivable pero también se almacena** — `metadata.arn` en el manifest lo hace self-contained.
4. **Cross-resource references son ARN completos** — Agent referencia skills via ARN, stages referencian agents via ARN.
5. **Scope determina visibilidad** — global > project > workspace. Proyectos pueden usar recursos global, pero no al revés.
6. **Edge creation automática** — Al guardar, el sistema crea edges por cada referencia ARN encontrada.

---

## 2. Estado Actual — Investigación Realizada

### 2.1 Infraestructura existente (bien)

| Componente | Ubicación | Estado |
|-----------|-----------|--------|
| Tipo `Manifest<K>` con `ResourceMetadata` | `studio/src/types/manifest.ts` | ✅ Correcto |
| `buildArn(scope, kind, name)` | `studio/src/types/manifest.ts` | ✅ Existe |
| `parseArn(arn)` | `studio/src/types/manifest.ts` | ✅ Existe |
| `Arn::new()` Rust | `crates/registry/src/domain/arn.rs` | ✅ Existe |
| 7 `ResourceKind` + 7 `ResourceType` | `studio/src/types/manifest.ts` | ✅ Correcto |
| Scope: global / project/{id} / workspace/{id} | `studio/src/types/manifest.ts` | ✅ Correcto |
| Registry nodes usan ARN como `.id` | `crates/registry/src/domain/node.rs` | ✅ Correcto |
| `Workflow.arn` como identidad | `crates/workflow/src/domain/workflow.rs` | ✅ Correcto |
| `resolveEffectiveScope()` con precedencia | `studio/src/types/manifest.ts` | ✅ Correcto |
| `isMoreSpecific()` para override precedence | `studio/src/types/manifest.ts` | ✅ Correcto |

### 2.2 Gaps encontrados (rotos)

| # | Problema | Impacto | Ubicación |
|---|----------|---------|-----------|
| G1 | **Project scope no se resuelve** | `arn:local:project/app:workflow/x` no encuentra el archivo en disco | `crates/mcp-server/src/state.rs:get_content_path()` |
| G2 | **apiVersion inconsistente** | Studio usa `workflows.local/v1` para TODO; backend usa `agents.local/v1`, `skills.local/v1`, etc. | todos los editors vs `resources/*.rs` |
| G3 | **Scanner legacy activo** | `workflow:arn://local/{namespace}/{name}` todavía se parsea como formato viejo | `crates/registry/src/application/scanner.rs` |
| G4 | **Frontend lookup incompleto** | `arnToTool()` solo soporta workflow/agent/skill/prompt. NO soporta tool/template/policy/execution/artifact | `studio/src/hooks/mcpClient.ts` |
| G5 | **Policy tipado pero no implementado** | `kind: Policy` en tipos Studio, sin CRUD, sin MCP, sin NodeType | solo types |
| G6 | **Stage como NodeType sin ARN lifecycle** | `NodeType::Stage` existe pero no hay constructor de ARN ni CRUD | `crates/registry/src/domain/node.rs` |
| G7 | **ARN parsing frágil** | Usa `arn.contains("/skill/")` en vez de `parseArn()` o el regex del value object | `crates/mcp-server/src/rest_handlers.rs` |
| G8 | **Sin `metadata.arn` en manifests** | El ARN no vive en el YAML; se deriva de scope+kind+name. No es self-contained. | `studio/src/types/manifest.ts` |
| G9 | **Scope hardcodeado `global` en workflow serialization** | `workflowToYaml()` siempre escribe `scope: global` sin importar el route | `studio/src/lib/workflowToYaml.ts` |
| G10 | **Name/ARN mismatch en New Workflow** | ARN dice `new-workflow`, name dice `New Workflow` | `studio/src/components/design/WorkflowEditorPage.tsx` |
| G11 | **Seed examples desactualizados** | `workflow-seed-echo.yaml` no usa manifest shape ni ARN correctos | `crates/mcp-server/src/resources/seed/` |
| G12 | **Inspector no expone la mayoría de fields** | Stage inspector solo tiene: label, description, agent, mode, depends_on, retry | `studio/src/components/design/inspector/WorkflowInspector.tsx` |

---

## 3. Patrones ARN por Tipo de Recurso

### 3.1 Recursos de diseño (Registry)

| Tipo | ARN Pattern | apiVersion | Archivo | Ejemplo |
|------|------------|------------|---------|---------|
| Workflow | `arn:local:{scope}:workflow/{name}` | `workflows.local/v1` | `{scope}/workflows/{name}.yaml` | `arn:local:project/app:workflow/sdd-full` |
| Agent | `arn:local:{scope}:agent/{name}` | `agents.local/v1` | `{scope}/agents/{name}.yaml` | `arn:local:global:agent/orchestrator` |
| Skill | `arn:local:{scope}:skill/{name}` | `skills.local/v1` | `{scope}/skills/{name}/SKILL.md` | `arn:local:global:skill/sdd-explore` |
| Prompt | `arn:local:{scope}:prompt/{name}` | `prompts.local/v1` | `{scope}/prompts/{name}.md` | `arn:local:global:prompt/sdd-orchestrator` |
| Tool | `arn:local:{scope}:tool/{name}` | `tools.local/v1` | `{scope}/tools/{name}.yaml` | `arn:local:global:tool/bash` |
| Template | `arn:local:{scope}:template/{name}` | `templates.local/v1` | `{scope}/templates/{name}` | `arn:local:global:template/json-output` |
| Policy | `arn:local:{scope}:policy/{name}` | `policies.local/v1` | `{scope}/policies/{name}.yaml` | `arn:local:global:policy/require-validation` |

### 3.2 Recursos de runtime (Execution context)

| Tipo | ARN Pattern | Generación | Ejemplo |
|------|------------|------------|---------|
| Execution | `arn:local:workspace/{id}:execution/{run-id}` | Auto (timestamp) | `arn:local:workspace/abc:execution/run-20260528-001` |
| Artifact | `arn:local:workspace/{id}:artifact/{name}` | Auto (stage output) | `arn:local:workspace/abc:artifact/explore-report` |
| Insight | `arn:local:workspace/{id}:execution/{run}/insight/{n}` | Auto (event log) | `arn:local:workspace/abc:execution/run-001/insight/42` |

### 3.3 Sub-recursos (identidad compuesta)

| Tipo | ARN Pattern | Nota | Ejemplo |
|------|------------|------|---------|
| Stage | `arn:local:{scope}:workflow/{wf}/stage/{stage-id}` | No tiene archivo propio, vive dentro del workflow YAML | `arn:local:project/app:workflow/sdd-full/stage/explore` |
| Step | `arn:local:{scope}:workflow/{wf}/stage/{stage}/step/{step}` | Opcional, para sub-descomposición dentro de un stage | `arn:local:project/app:workflow/sdd-full/stage/apply/step/1` |

---

## 4. Manifest Shape por Recurso (Self-Contained con ARN)

### 4.1 Workflow

```yaml
apiVersion: workflows.local/v1
kind: Workflow
metadata:
  uid: "550e8400-e29b-41d4-a716-446655440000"
  arn: arn:local:project/app:workflow/sdd-full
  name: sdd-full
  scope: project/app
  labels:
    sdd: "true"
    template: "full-lifecycle"
  annotations:
    description: "Full SDD lifecycle workflow"
spec:
  description: "Complete Spec-Driven Development lifecycle"
  stages:
    - id: explore
      agent: arn:local:project/app:agent/sdd-explore
      depends_on: []
      description: "Explore and investigate the change"
      input: {}
      output:
        artifacts: []
      execution:
        mode: sequential
        retry:
          max_attempts: 1
          backoff_ms: 0
      conditions: []
      metrics: []
  agents: {}
  skills: {}
  execution:
    mode: sequential
    on_failure: abort
  metrics:
    streaming: false
    interval_ms: 5000
    channels: ["execution"]
```

### 4.2 Agent

```yaml
apiVersion: agents.local/v1
kind: Agent
metadata:
  uid: "..."
  arn: arn:local:project/app:agent/sdd-explore
  name: sdd-explore
  scope: project/app
  labels: {}
  annotations: {}
spec:
  description: "SDD exploration agent"
  model: "provider/model"
  prompt: arn:local:global:prompt/sdd-orchestrator
  skills:
    - arn:local:global:skill/sdd-explore
  tools:
    arn:local:global:tool/bash: true
    arn:local:global:tool/read: true
```

### 4.3 Skill

```yaml
apiVersion: skills.local/v1
kind: Skill
metadata:
  uid: "..."
  arn: arn:local:global:skill/sdd-explore
  name: sdd-explore
  scope: global
  labels: {}
  annotations: {}
spec:
  description: "SDD exploration skill"
  required_tools:
    - bash
    - read
  triggers:
    - "explore"
    - "investigate"
  references: []
```

### 4.4 Prompt

```yaml
apiVersion: prompts.local/v1
kind: Prompt
metadata:
  uid: "..."
  arn: arn:local:global:prompt/sdd-orchestrator
  name: sdd-orchestrator
  scope: global
  labels: {}
  annotations: {}
spec:
  description: "SDD orchestrator system prompt"
  kind: system
  template: |
    You are an SDD orchestrator agent...
```

### 4.5 Artifact

```yaml
apiVersion: artifacts.local/v1
kind: Artifact
metadata:
  uid: "..."
  arn: arn:local:workspace/abc:artifact/explore-report-001
  name: explore-report-001
  scope: workspace/abc
  labels: {}
  annotations: {}
spec:
  workflow_arn: arn:local:project/app:workflow/sdd-full
  execution_arn: arn:local:workspace/abc:execution/run-001
  stage_id: explore
  content_type: text/markdown
  size_bytes: 4096
  created_at: "2026-05-28T10:00:00Z"
```

---

## 5. Arquitectura de Almacenamiento (ARN → Path)

```
~/.workflows/
├── global/
│   ├── registry.db                         # SQLite cache
│   ├── workflows/{name}.yaml               # arn:local:global:workflow/{name}
│   ├── agents/{name}.yaml                  # arn:local:global:agent/{name}
│   ├── skills/{name}/SKILL.md              # arn:local:global:skill/{name}
│   ├── prompts/{name}.md                   # arn:local:global:prompt/{name}
│   ├── tools/{name}.yaml                   # arn:local:global:tool/{name}
│   ├── templates/{name}                    # arn:local:global:template/{name}
│   └── policies/{name}.yaml                # arn:local:global:policy/{name}
│
├── projects/{projectId}/
│   ├── registry.db                         # SQLite cache (project-scoped)
│   ├── workflows/{name}.yaml               # arn:local:project/{projectId}:workflow/{name}
│   ├── agents/{name}.yaml                  # arn:local:project/{projectId}:agent/{name}
│   ├── skills/{name}/SKILL.md              # arn:local:project/{projectId}:skill/{name}
│   ├── prompts/{name}.md                   # arn:local:project/{projectId}:prompt/{name}
│   ├── tools/{name}.yaml                   # arn:local:project/{projectId}:tool/{name}
│   ├── templates/{name}                    # arn:local:project/{projectId}:template/{name}
│   └── policies/{name}.yaml                # arn:local:project/{projectId}:policy/{name}
│
└── workspaces/{workspaceId}/
    ├── registry.db                         # SQLite cache (workspace-scoped)
    ├── workflows/{name}.yaml               # arn:local:workspace/{workspaceId}:workflow/{name}
    ├── agents/{name}.yaml                  # arn:local:workspace/{workspaceId}:agent/{name}
    ├── artifacts/{name}                    # arn:local:workspace/{workspaceId}:artifact/{name}
    ├── executions/                         # arn:local:workspace/{workspaceId}:execution/{name}
    │   └── {name}.yaml
    └── insights/                           # arn:local:workspace/{workspaceId}:execution/{name}/insight/{n}
        └── {executionName}/
            └── {id}.json
```

---

## 6. Investigación de Editores de Referencia

### 6.1 Herramientas analizadas

| Herramienta | Enfoque "Blank Canvas" | Qué copiar |
|-------------|----------------------|-----------|
| **n8n** | Templates library + "add first node" flow | Template discoverability masiva |
| **Langflow** | Template chooser (Blank vs Templates) antes del canvas | Decisión blank-vs-template temprana |
| **Flowise** | Start node obligatorio + node taxonomy precisa | Start node requerido |
| **Dify** | Palette tabs por intent (`Plan`, `Specify`, `Implement`) | Organización por acción, no por tipo |
| **LangGraph Studio** | Config/versioning layer sobre el graph | Config como layer, no como nodo |
| **CrewAI** | Prompt-to-generate como primer-class creation path | AI genera el workflow desde descripción |
| **AutoGen Studio** | Visual ↔ JSON toggle real sin perder estado | Dualidad visual/code real |

### 6.2 Patrones universales

1. **Start node obligatorio** — Flowise, Dify, AutoGen Studio
2. **Template chooser al crear** — Langflow, AutoGen Studio, CrewAI
3. **Prompt-to-generate** — CrewAI, AutoGen Studio
4. **Paleta por intent** — Dify, Flowise
5. **Visual + code duality** — AutoGen Studio, n8n
6. **Guided empty state** — Todos

### 6.3 UX recomendada para "New Workflow"

```
┌─────────────────────────────────────────────────────┐
│  Create SDD Workflow                                 │
│                                                      │
│  Step 1: Scope                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ Global   │ │ Project  │ │Workspace │             │
│  │ everyone │ │ app      │ │ abc123   │             │
│  └──────────┘ └──────────┘ └──────────┘             │
│                                                      │
│  Step 2: Name                                        │
│  [sdd-full-lifecycle                              ]  │
│  ARN: arn:local:project/app:workflow/sdd-full-lif... │
│                                                      │
│  Step 3: Template                                    │
│  ┌──────────────────┐ ┌────────────┐ ┌────────────┐ │
│  │ Full SDD Lifecycle│ │ Quick Path │ │ Bugfix     │ │
│  │ 8 stages         │ │ 4 stages   │ │ 4 stages   │ │
│  └──────────────────┘ └────────────┘ └────────────┘ │
│  ┌──────────────┐ ┌────────────┐                     │
│  │ Architecture │ │ Blank      │                     │
│  │ 8 stages +   │ │ Start only │                     │
│  │ archive      │ │            │                     │
│  └──────────────┘ └────────────┘                     │
│                                                      │
│            [ Create Workflow ]                        │
└─────────────────────────────────────────────────────┘
```

### 6.4 Templates concretos

**Full SDD Lifecycle (8 stages):**
```
Start → Explore → Propose → Design → Spec → Tasks → Apply → Verify → Archive
```

**Quick Path (4 stages):**
```
Start → Explore → Tasks → Apply → Verify
```

**Bugfix Flow (4 stages):**
```
Start → Explore → Design → Apply → Verify
```

**Architecture Change (8 stages + archive):**
```
Start → Explore → Propose → Design → Spec → Tasks → Apply → Verify → Archive
```

**Blank Canvas:**
```
Start → (ghosted: explore → propose → design → spec → tasks → apply → verify → archive)
```

---

## 7. Stage Palette ARN-aware

Organizada por **intent**, no por tipo técnico:

```
SDD STAGES (primero y prominente)
├── Start       → entry point (requerido)
├── Explore     → descubre, investiga    → sugiere: arn:local:{scope}:agent/sdd-explore
├── Propose     → intención de cambio    → sugiere: arn:local:{scope}:agent/sdd-propose
├── Design      → arquitectura           → sugiere: arn:local:{scope}:agent/sdd-design
├── Spec        → requerimientos         → sugiere: arn:local:{scope}:agent/sdd-spec
├── Tasks       → unidades de trabajo    → sugiere: arn:local:{scope}:agent/sdd-tasks
├── Apply       → implementación         → sugiere: arn:local:{scope}:agent/sdd-apply
├── Verify      → tests/evidencia        → sugiere: arn:local:{scope}:agent/sdd-verify
└── Archive     → cierre y persist       → sugiere: arn:local:{scope}:agent/sdd-archive

CONTROL FLOW
├── Condition   → branching (if/else)
├── Iterator    → loop over collection
└── Parallel    → ejecución concurrente

CONTEXT / INPUTS
├── User Input  → human-in-the-loop
├── Context Load → cargar datos externos
└── Variable    → definir variable de workflow

ARTIFACTS / OUTPUTS
├── Artifact Store → persistir output
├── Notification  → avisar al usuario
└── API Call      → llamada externa
```

Cada stage:
- Tiene nombre, descripción, icono
- Sugiere agent ARN según scope actual
- Muestra warning si el agent no existe en ese scope
- Pre-llena defaults sensatos (retry, mode, etc.)

---

## 8. Inspector Completo

### 8.1 Workflow-level (panel superior)

Campos que faltan exponer:

| Campo | Tipo | Control |
|-------|------|---------|
| `metadata.name` | string | Input (slug-safe, actualiza ARN preview) |
| `metadata.scope` | enum | Dropdown: global / project/{id} / workspace/{id} |
| `metadata.labels` | map | Key-value editor |
| `metadata.annotations` | map | Key-value editor |
| `spec.description` | string | Textarea |
| `spec.execution.mode` | enum | Dropdown: sequential / parallel |
| `spec.execution.on_failure` | enum | Dropdown: abort / continue / retry |
| `spec.metrics.streaming` | boolean | Toggle |
| `spec.metrics.interval_ms` | number | Slider |
| `spec.metrics.channels` | array | Multi-select |
| `spec.agents` | map | Agent ARN editor (lookup desde registry) |
| `spec.skills` | map | Skill ARN editor (lookup desde registry) |

### 8.2 Stage-level (inspector actual extendido)

Campos que faltan exponer:

| Campo | Tipo | Control |
|-------|------|---------|
| `input` | Record<string, InputValue> | Key-value con tipo: static / from / template |
| `output.artifacts` | ArtifactRef[] | Artifact builder (name, path_template, content_type) |
| `conditions` | Condition[] | Condition builder (when, operator, value) |
| `execution.batch_size` | number? | Number input (visible solo si mode=batch) |
| `execution.retry.max_attempts` | number | Slider 1-10 |
| `execution.retry.backoff_ms` | number | Slider 0-10000 |
| `metrics` | string[] | Metric selector |

---

## 9. Roadmap de Implementación

### Phase 0: Baseline ARN — Bug Fixes (1-2 días)

| # | Task | Gap | Scope |
|---|------|-----|-------|
| 0.1 | `get_content_path()` soporta `project/{id}` | G1 | backend |
| 0.2 | Unificar apiVersion: Studio usa type-specific `agents.local/v1`, `skills.local/v1`, etc. | G2 | studio |
| 0.3 | `arnToTool()` soporta tool/template/policy/execution/artifact | G4 | studio |
| 0.4 | ARN parsing en `rest_handlers.rs` usa `parseArn()` o `Arn::parse()` | G7 | backend |
| 0.5 | Actualizar seed examples a manifest shape correcto con ARN | G11 | both |
| 0.6 | Actualizar scanner legacy `arn://` → `arn:local:` | G3 | backend |
| 0.7 | Fix scope hardcodeado en `workflowToYaml` | G9 | studio |
| 0.8 | Fix Name/ARN mismatch en New Workflow | G10 | studio |
| 0.9 | Agregar `metadata.arn` a `ResourceMetadata` type | G8 | studio |

### Phase 1: Workflow Editor ARN-correcto (2-3 días)

| # | Task | Detail |
|---|------|--------|
| 1.1 | Crear `NewWorkflowPage` con creation flow | 3 pasos: scope → name → template |
| 1.2 | Name input con validación slug + ARN preview en tiempo real | Usa `buildArn()` |
| 1.3 | Scope selector actualiza ARN preview dinámicamente | global / project / workspace |
| 1.4 | Templates pre-llenan stages con agent ARNs sugeridos | `arn:local:{scope}:agent/sdd-{stage}` |
| 1.5 | Workflow-level inspector: name, scope, labels, annotations | Panel superior |
| 1.6 | Ghosted canonical path en blank canvas | empty state con guidance |
| 1.7 | 4 templates: Full SDD, Quick Path, Bugfix, Architecture | Cada uno con stages pre-conectados |

### Phase 2: Stage Palette ARN-correcta (1-2 días)

| # | Task | Detail |
|---|------|--------|
| 2.1 | 8 SDD stages con agent ARN sugerido por scope | Palette items con ARN |
| 2.2 | Agent dropdown: autocomplete desde `list_agents` filtrado por scope | Registry lookup real |
| 2.3 | Skill dropdown: autocomplete desde `list_skills` filtrado por scope | Registry lookup real |
| 2.4 | Warning si agent/skill ARN no existe en scope | "Create first or change scope" |
| 2.5 | Organizar paleta por intent (no por tipo técnico) | SDD Stages / Control / Context / Artifacts |

### Phase 3: Inspector Completo (2-3 días)

| # | Task | Detail |
|---|------|--------|
| 3.1 | Stage: `input` editor | Key-value con tipo: static / from / template |
| 3.2 | Stage: `output.artifacts` editor | ArtifactRef builder |
| 3.3 | Stage: `conditions` builder | Condition type + operators |
| 3.4 | Stage: `execution.retry` (sliders) | max_attempts, backoff_ms |
| 3.5 | Stage: `execution.batch_size` (condicional) | Solo visible si mode=batch |
| 3.6 | Workflow-level: `execution.on_failure` dropdown | abort / continue / retry |
| 3.7 | Workflow-level: `metrics` editor | streaming, interval_ms, channels |
| 3.8 | Workflow-level: `agents` map editor | Agent ARN lookup + add/remove |
| 3.9 | Workflow-level: `skills` map editor | Skill ARN lookup + add/remove |

### Phase 4: Registry Graph ARN-correcto (2-3 días)

| # | Task | Detail |
|---|------|--------|
| 4.1 | Edge creation al guardar: todas las refs ARN → edges | Registry stays in sync |
| 4.2 | Dependency graph muestra edges ARN-cross-resource | DependenciesPage con ARN labels |
| 4.3 | Orphan detection: alerta si ARN referenciado no existe | Validación cruzada |
| 4.4 | Impact analysis usa ARN graph completo | `list_edges` + `analyze_impact` |
| 4.5 | Policy CRUD completo (si se decide implementar) | Depende de ADR-001 |

### Phase 5: Canvas UX Polish (1-2 días)

| # | Task | Detail |
|---|------|--------|
| 5.1 | Drag-and-drop desde paleta al canvas | ReactFlow DnD |
| 5.2 | Auto-layout de stages (Dagre/ELK) | Layout automático |
| 5.3 | Scope indicator visible en todo momento | Badge con scope + ARN |
| 5.4 | Scope breadcrumb: global > project/app > workspace/abc | Navegación contextual |
| 5.5 | Visual feedback de conexiones ARN cross-resource | Líneas punteadas para refs |

---

## 10. Decisiones de Diseño (ADR pendientes)

| # | Pregunta | Decisión propuesta | Rationale |
|---|----------|-------------------|-----------|
| ADR-001 | ¿Stage tiene ARN propio? | **Sí** — `arn:local:{scope}:workflow/{wf}/stage/{id}` | Permite traceability, edge creation, y future per-stage execution |
| ADR-002 | ¿Step tiene ARN propio? | **Condicional** — solo si es monitoreable como unidad | Sub-steps son impl detail del stage |
| ADR-003 | ¿`metadata.arn` en el manifest? | **Sí** — el YAML es self-contained | Un YAML sin contexto debe ser interpretable |
| ADR-004 | ¿apiVersion por tipo? | **Sí** — `workflows.local/v1`, `agents.local/v1`, etc. | Cada tipo evoluciona independientemente |
| ADR-005 | ¿Project scope lectura/escritura? | **Ambos** — crear, editar, eliminar en project scope | Hereda de global, no de otros projects |
| ADR-006 | ¿Referencias cross-scope? | **Solo scope más amplio** — project puede usar global, no al revés | Evita dependencias circulares |
| ADR-007 | ¿Policy se implementa? | **Phase 4** — no bloqueante para workflow editor | Policy necesita su propio CRUD |
| ADR-008 | ¿Nombre inmutable? | **Sí** — name change = delete + create | ARN es identidad; cambiar name cambia todo |

---

## 11. Inversión Estimada

| Phase | Días | Prioridad | Descripción |
|-------|------|-----------|-------------|
| Phase 0 | 1-2 | 🔴 CRITICAL | Baseline ARN (9 bugfixes) |
| Phase 1 | 2-3 | 🔴 CRITICAL | Workflow editor ARN-correcto |
| Phase 2 | 1-2 | 🟡 HIGH | Stage palette + agent/skill dropdowns |
| Phase 3 | 2-3 | 🟡 HIGH | Inspector completo |
| Phase 4 | 2-3 | 🟢 MEDIUM | Registry graph + edges + orphan detection |
| Phase 5 | 1-2 | 🟢 MEDIUM | Canvas UX polish |
| **Total** | **9-15** | | **ARN universal completo** |

---

## 12. Quick Wins (lo primero que se ve)

1. Fix scope en `workflowToYaml` → YA no hardcodear `global`
2. Fix name/ARN mismatch → slug consistente
3. Agregar `metadata.arn` al manifest type
4. Crear seed workflow con 8 stages SDD y ARN correctos
5. Template chooser básico (Full SDD / Blank) antes del canvas vacío

---

## 13. Referencias

- `CONTEXT.md` — Domain language, ARN format, bounded contexts
- `docs/studio-redesign.md` — Studio redesign spec, Resource Composer flow
- `docs/STUDIO-GAP-ANALYSIS.md` — 28 gaps entre specs e implementación
- `docs/sdd/studio-p0/design.md` — P0 sprint design
- `studio/src/types/manifest.ts` — ARN construction/parsing, Manifest base type
- `studio/src/types/workflow.ts` — Workflow/Stage types
- `crates/registry/src/domain/arn.rs` — Rust ARN value object
- `crates/registry/src/application/scanner.rs` — Legacy ARN format (a actualizar)
