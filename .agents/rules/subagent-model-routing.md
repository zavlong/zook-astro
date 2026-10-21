---
trigger: always_on
description: Route UI and non-heavy tasks to Flash 3.8 subagents and reserve Gemini 4 Argon (Pro) for intensive math, physics, and deep reasoning
---

# Subagent & Model Routing Strategy

Always optimize model usage across all chats by matching task complexity to the appropriate model tier:

- **Flash 3.8 (`Model: "flash"`) — UI, Layout, Non-Heavy-Lift & Research**:
  - Use `invoke_subagent` with `Model: "flash"` for UI components, layout/Tailwind styling, filter buttons, modals, tooltips, straightforward state wiring, and codebase research (`TypeName: "research"` or `TypeName: "self"`).
  - Use `Model: "flash_lite"` for quick, trivial file lookups or symbol searches.

- **Gemini 4 Argon (`Model: "pro"`) — Intensive Reasoning, Astrophysics & Heavy Math**:
  - Reserve Gemini 4 Argon (`Model: "pro"`, or direct execution when the main chat is running Gemini 4 Argon) for tasks that genuinely require deep mathematical reasoning, astrophysics equations, 3D spherical noise/projection math, orbital mechanics, or complex performance architecture.

- **Coordinated Hybrid Workflows**:
  - From any chat, act as coordinator: if a task is UI-focused or routine while the active chat is on Gemini 4 Argon, delegate the implementation to a `Model: "flash"` subagent. Conversely, if a chat is on Flash and encounters heavy mathematical or astrophysical modeling, invoke a `Model: "pro"` subagent for the math core.
