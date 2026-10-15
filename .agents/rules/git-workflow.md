---
trigger: always_on
description: Automatically commit and push all code changes to GitHub upon completing any task or user request
---

# Git Workflow & Automatic Commits

- **Automatic Commit & Push**:
  Whenever code or assets are modified, created, or deleted as part of fulfilling a user request:
  1. Verify build integrity (`npm.cmd run build`).
  2. Stage all working changes (`git add .`).
  3. Commit the changes using a concise, descriptive semantic commit message (`feat: ...`, `fix: ...`, `refactor: ...`).
  4. Push the commit to GitHub (`git push origin main`).
  5. Include the commit hash and summary in the response to the user.
