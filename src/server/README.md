# Server Layer

Reusable backend business logic will live here.

Planned domain convention:

```text
src/server/modules/<domain>/
  <domain>.types.ts
  <domain>.schemas.ts
  <domain>.repository.ts
  <domain>.service.ts
  <domain>.permissions.ts
```

Repositories own database access. Services own business rules. Permission modules own authorization. UI components must not own backend business logic.
