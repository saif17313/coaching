import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("package exposes required verification scripts", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  for (const script of ["lint", "typecheck", "test", "build", "verify:structure"]) {
    assert.equal(typeof packageJson.scripts?.[script], "string");
  }
});

test("production stack uses intended versions", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageJson.dependencies.next, "16.4.2");
  assert.equal(packageJson.dependencies.react, "19.2.8");
  assert.equal(packageJson.dependencies["react-dom"], "19.2.8");
  assert.equal(packageJson.devDependencies.typescript, "6.0.3");
  assert.equal(packageJson.devDependencies.eslint, "9.39.5");
});

test("environment example contains no populated secret", async () => {
  const envExample = await readFile(".env.example", "utf8");
  assert.doesNotMatch(envExample, /SERVICE_ROLE_KEY\\s*=\\s*\\S+/i);
  assert.doesNotMatch(envExample, /DATABASE_URL\\s*=\\s*\\S+/i);
});
