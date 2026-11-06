# Student IDs and administrator setup — 6 November 2026

Applied Supabase migration: `20261106142600_automatic_student_numbers_and_login.sql`.

The existing 14 students have unique ten-digit IDs. The database sequence assigns
IDs to new Auth signups and offline student records. IDs cannot be edited, do not
cycle, and are generated without teacher input. Existing UUID relationships and
receipt snapshots remain intact; previous admission references are retained in
`student_admission_details.legacy_admission_roll`.

The existing `admissionRoll` API property now carries the Student ID. Profiles,
directories, batch rosters, payment history, exam sheets, exports and newly issued
receipts use the same stored value. Validators accept previous admission references
for compatibility with existing snapshots and fixtures.

The login form accepts a Student ID or email, followed by the existing password.
A server-only RPC resolves the Student ID to the student's Auth email. Anonymous
and authenticated browser roles cannot execute this lookup. Password verification,
active account checks and the session cookie continue through the existing Auth
flow. Offline records receive IDs immediately; their portal login must still be
activated and a password chosen before signing in.

`admin@example.com` was created, email-confirmed and granted the existing active
Teacher/admin role. Its password was supplied by the user and is not stored here.
Its login and teacher account/directory access were verified against the live site.

Verification:

- 786 application tests pass; production build passes.
- Lint has no errors (three existing warnings in the checked files).
- A rollback-only database check verified automatic assignment and immutability
  across 20 inserts, and checked that ID lookup is not callable by browser roles.
- A temporary real Auth student verified incorrect-password rejection, unknown-ID
  rejection, both login identifiers resolving to the same profile, and the ID
  appearing in the actual browser. The fixture is removed after verification.
- Supabase security advisers reported no new findings for the added functions.

The application changes still need deployment. The connected Vercel account does
not expose the existing EduCentre project; the local CLI has no credentials.
Deploy these application changes using the Vercel account that owns
`educentre-iota.vercel.app`. The server needs `SUPABASE_AUTH_ADMIN_KEY` for the
private Student ID lookup, in addition to the existing Supabase URL and anon key.

To repeat the real account check, run:

```powershell
node --env-file=.env.local scripts/verify-student-number-login.mjs
```

Set `EDUCENTRE_PLAYWRIGHT_MODULE` to a local `playwright-core/index.mjs` to include
the browser login check. Credentials and the temporary password are never logged.
