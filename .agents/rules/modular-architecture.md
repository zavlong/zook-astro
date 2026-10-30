# Modular Architecture, Shared Libraries & File Size Guidelines

## Core Principles
1. **Single Responsibility & Separation of Concerns**:
   - React components (`.tsx`) must focus strictly on UI layout, component state, user interaction, and event handling.
   - Pure algorithmic math, physics simulations, 3D geometry generation, rasterizers, noise formulas, and static palettes/lookup tables must reside in pure `.ts` utility or domain modules under `src/core/` (e.g., `src/core/math/`, `src/core/astrophysics/`) or dedicated `utils/` directories.
   - Distinct views (such as Schematic View, Orrery View, Dossier Modals, Sidebars, and Sub-panels) must never be inlined as giant render functions inside a parent component; extract them into dedicated memoized (`React.memo`) component files under `views/`, `modals/`, or `panels/`.

2. **500-Line File Size Target & Modular Decomposition**:
   - Strive to keep files **under ~500 lines** of code whenever logically separable.
   - Any file exceeding 500 lines must be audited for decomposition into cohesive sub-modules, custom hooks, sub-components, or shared pure `.ts` libraries.
   - Avoid monolithic multi-thousand-line files (such as inline SVG/Canvas renderers inside top-level app containers).

3. **De-duplication via Custom Shared Libraries**:
   - Never duplicate math helpers (`clamp`, `lerp`, `smoothstep`, `log10`, `hash2`, `hash3`), color conversions (`hexToRgb`, `rgbToHex`), or astrophysical formatting functions across multiple files.
   - Centralize shared utilities in `src/core/math/mathUtils.ts` and `src/core/math/colorUtils.ts` and import them across all generators, canvases, and UI views.

4. **Multi-Agent Model Routing for Refactoring & Optimization**:
   - **Gemini 4 Argon (`Model: "pro"`)**: Handle algorithmic performance bottlenecks, procedural math/noise optimizations, canvas rendering pipelines, and architectural design.
   - **Flash 3.8 (`Model: "flash"`)**: Delegate UI component extraction, modular file splitting, shared utility rewiring, and boilerplate refactoring to `flash` subagents to maximize speed and model efficiency.
