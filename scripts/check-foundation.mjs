import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const requiredFiles = [
  ".env.example",
  ".gitignore",
  "README.md",
  "docs/BACKEND_MASTER_PLAN.md",
  "eslint.config.mjs",
  "next-env.d.ts",
  "next.config.ts",
  "package.json",
  "src/app/api/v1/health/route.ts",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/config/app.ts",
  "src/server/README.md",
  "tests/foundation.test.mjs",
  "tsconfig.json"
];

for (const file of requiredFiles) {
  await access(file, constants.R_OK);
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
for (const script of ["build", "lint", "typecheck", "test", "verify:structure"]) {
  if (!packageJson.scripts?.[script]) throw new Error(`Missing npm script: ${script}`);
}

const envExample = await readFile(".env.example", "utf8");
for (const pattern of [/service[_-]?role\\s*=\\s*\\S+/i, /password\\s*=\\s*\\S+/i, /secret\\s*=\\s*\\S+/i]) {
  if (pattern.test(envExample)) throw new Error(".env.example appears to contain a real secret.");
}

console.log("Foundation structure: PASS");
