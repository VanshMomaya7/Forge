import { defineConfig } from "vitest/config";

// Exclude generated worktrees/site sources (full repo copies the agents write
// into) so their duplicated test files never run, alongside the vitest defaults.
export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**",
      "**/.cache/**",
      "**/coverage/**",
      "forge-worktrees/**",
      "forge-worktrees-test/**",
      "forge-sites/**",
      "**/.local-compose/**",
      ".codex-runtime/**",
      "**/.smoke*/**",
    ],
  },
});
