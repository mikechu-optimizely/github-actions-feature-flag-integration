# Deno 2.x Development Environment Setup

## Prerequisites
- [Deno 2.x](https://deno.com/manual@v2.0.0/getting_started/installation) (latest stable)
- [VS Code](https://code.visualstudio.com/) with [Deno extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno)

## Setup Steps

1. **Install Deno 2.x**
   - Windows (PowerShell):
     ```powershell
     iwr https://deno.land/install.ps1 -useb | iex
     ```
   - macOS/Linux:
     ```sh
     curl -fsSL https://deno.land/install.sh | sh
     ```
   - Verify:
     ```sh
     deno --version
     ```

2. **Clone the Repository**
   ```sh
   git clone <your-repo-url>
   cd feature-flag-sync-action
   ```

3. **Install VS Code Extensions**
   - Deno (denoland.vscode-deno)
   - YAML (redhat.vscode-yaml)

4. **Run Lint, Format, and Tests**
   ```sh
   deno lint src/
   deno fmt src/
   deno test --allow-all src/
   ```

5. **Configure Environment Variables**
   - Set the following for local development or in your CI/CD secrets:
     - `OPTIMIZELY_API_TOKEN`
     - `OPTIMIZELY_PROJECT_ID`
     - `GITHUB_TOKEN`

6. **Run the Main Script**
   ```sh
   deno run --allow-all src/main.ts
   ```

## Project Structure
See [docs/tdd.md](./tdd.md) for architecture and module details.
