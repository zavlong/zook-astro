# Agent Instructions for Zook Astro

## Automatic Git Commits & Pushes
- Upon completing every user request, refactor, or feature update:
  1. Ensure the code compiles cleanly (`npm.cmd run build`).
  2. Stage all modifications (`git add .`).
  3. Create a semantic commit with a clear description (`git commit -m "..."`).
  4. Push to GitHub (`git push origin main`).
  5. Summarize the commit in the user-facing response.
