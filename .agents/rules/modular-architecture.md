# Modular Architecture & File Size Guidelines

## Core Principles
1. **Single Responsibility & Separation of Concerns**:
   - React components (`.tsx`) must focus strictly on UI layout, component state, user interaction, and event handling.
   - Pure algorithmic math, physics simulations, 3D geometry generation, rasterizers, noise formulas, and static palettes/lookup tables must reside in pure `.ts` utility or domain modules under `src/core/` or `src/components/.../utils/`.
   - Modals, complex sub-panels, and drawer views should not be inlined into parent app views; extract them into dedicated component files under appropriate subdirectories (e.g., `modals/`, `panels/`).

2. **File Size & Scope Targets**:
   - Keep files focused, maintainable, and modular. As a general target, files should strive to remain under ~600–800 lines of code whenever logically separable.
   - When a file exceeds 1,000 lines, actively look for opportunities to decouple domain logic, extract sub-components, or externalize math algorithms into dedicated library files.
   - Avoid creating arbitrary tiny fragment files: ensure extracted modules have coherent domain boundaries (e.g. `surfaceNoise.ts`, `skyDomeRenderer.ts`, `biomePalettes.ts`).

3. **Reusability & Code Duplication Elimination**:
   - If mathematical functions, rendering routines, shaders, or color transforms are needed by multiple views (e.g. `LocalTileTerrainView` and `FirstPersonSurfaceView`), extract them to a shared library rather than duplicating inline implementations.
