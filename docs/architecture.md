# Visual Quality Engine v0.1 — Architecture

## Pipeline

```text
VideoSpec / SceneGraph / Timeline / Transcript / Preview Render
                    │
                    ↓
             Project Adapter
                    │
                    ↓
             QualitySnapshot
                    │
          ┌─────────┴─────────┐
          ↓                   ↓
   Deterministic Rules   Semantic/Vision Critic
          │                   │
          └─────────┬─────────┘
                    ↓
               MetricResult[]
                    ↓
          Hard Gate + Score Engine
                    ↓
              QualityReport
                    ↓
             Revision Planner
                    ↓
                Re-render
```

## Architectural rules

1. Generator and critic are separate responsibilities.
2. Deterministic metrics never call an LLM.
3. Project-specific Remotion extraction lives in an Adapter.
4. Metrics operate on normalized values, not raw project-specific props.
5. `Q01/Q02` are hard gates; a hard-gate failure overrides aesthetic score.
6. Thresholds belong to a `StyleProfile`, not global constants.
7. v0.1 implements only the P0 15 metrics; the 50-metric catalog defines the expansion boundary.
