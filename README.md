# Musa Sir — Windows Supabase CLI runner fix v1

The existing signed-JWT E2E runner invokes `supabase status --env`, which is not supported in the default local-project CLI mode. The supported flag there is `supabase status --output env`. On Windows PowerShell 5.1, an unsupported flag's stderr output can be promoted to a terminating NativeCommandError.

This fix patches **only** `RUN_LOCAL_JWT_E2E.ps1`, after checking its exact preimage SHA256. It also suppresses native stderr for the status capture while checking the CLI exit code, validates resulting SHA256 and parses PowerShell syntax, and writes a backup in the sibling `_coaching-installer-backups` directory. No database, cloud, .env.local, Git, or other source code changes.

To apply, extract `FIX_LOCAL_JWT_RUNNER_STATUS.ps1` to the coaching project root, and run:

```powershell
cd "E:\projects\Musa Sir\coaching"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\FIX_LOCAL_JWT_RUNNER_STATUS.ps1
```

Then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\RUN_LOCAL_JWT_E2E.ps1
```

Do not paste `supabase status --output env` raw output, because it contains secrets.

Expected before: `2D650634496C9911137A9DE2CC2224823D9269746D7BFB1B6688D1DC389EE797`
Expected after: `47982585B7A4061A2C7B258211A8FBB8C9147F790A5DF18C106AC069AF05BE66`
