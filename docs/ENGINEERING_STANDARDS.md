# Engineering Standards

- Route handlers are transport boundaries; business rules belong in services/use-cases.
- Database access belongs behind repositories/data-access modules.
- Shared infrastructure belongs in `src/lib`; shared contracts in `src/types`.
- Feature code belongs under `src/server/modules/<module>`.
- Validate all untrusted input before business logic.
- Authentication identifies the actor; authorization decides permissions.
- Deny by default; enforce authorization server-side.
- Never expose service-role credentials to browsers.
- Avoid N+1 queries; paginate lists and select only required columns.
- Do not log credentials, tokens, or unnecessary personal data.
- `main` is the integration line; feature work uses `feature/*`.
- Each completed implementation unit gets a focused commit.
- Local automation never pushes automatically.
