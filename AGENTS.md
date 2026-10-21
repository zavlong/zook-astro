# Agent Instructions for Zook Astro

## Subagent & Model Routing Strategy (Flash 3.8 vs. Gemini 4 Argon)
To maximize model efficiency across all chats, coordinate tasks by routing work to the appropriate model tier via `invoke_subagent` (`Model` parameter) or direct execution:

1. **Flash 3.8 (`Model: "flash"`) — UI, Styling, Routine Edits & Lookups**:
   - **When to use**: UI components, layout/CSS/Tailwind styling, modal/panel wiring, filter toggles, data formatting, codebase searches, file inspection, and other non-heavy-lift frontend or boilerplate tasks.
   - **Action**: Delegate these tasks to subagents (`self` or `research`) with `Model: "flash"` (or `Model: "flash_lite"` for simple read-only lookups) so heavy reasoning quota is conserved.

2. **Gemini 4 Argon (`Model: "pro"` or direct when active) — Intensive Math, Physics & Deep Architecture**:
   - **When to use**: Astrophysics modeling, orbital mechanics, radiative-convective atmosphere/greenhouse equations, 3D spherical procedural generation/shaders (`surfaceGenMath.ts`, `realisticStarGen.ts`), complex algorithmic optimization, and tricky multi-system debugging.
   - **Action**: Reserve Gemini 4 Argon (`Model: "pro"`, or `Model: "inherit"` when the active chat is already running Gemini 4 Argon) strictly for tasks requiring intensive mathematical reasoning or deep architectural synthesis.

3. **Hybrid Task Decomposition**:
   - When a user request combines both math/physics and UI work, split the task:
     - Handle the core mathematical/physical equations or algorithm design on **Gemini 4 Argon (`pro`)**.
     - Delegate the accompanying UI controls, badges, modals, and codebase lookups to a **Flash 3.8 (`flash`)** subagent.

## Automatic Git Commits & Pushes
- Upon completing every user request, refactor, or feature update:
  1. Ensure the code compiles cleanly (`npm.cmd run build`).
  2. Stage all modifications (`git add .`).
  3. Create a semantic commit with a clear description (`git commit -m "..."`).
  4. Push to GitHub (`git push origin main`).
  5. Summarize the commit in the user-facing response.

