import { randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env");

const required = {
  DATABASE_URL: "file:./dev.db",
  AUTH_SECRET: randomBytes(32).toString("hex"),
  AUTH_TRUST_HOST: "true",
};

if (!existsSync(envPath)) {
  const body = Object.entries(required)
    .map(([key, value]) => `${key}="${value}"`)
    .join("\n");
  writeFileSync(envPath, `${body}\n`);
  console.log("Created .env for local SQLite + NextAuth.");
  process.exit(0);
}

const current = readFileSync(envPath, "utf8");
const additions = [];
for (const [key, value] of Object.entries(required)) {
  const present = new RegExp(`^${key}=`, "m").test(current);
  if (!present) additions.push(`${key}="${value}"`);
}

if (additions.length > 0) {
  const suffix = current.endsWith("\n") ? "" : "\n";
  writeFileSync(envPath, `${current}${suffix}${additions.join("\n")}\n`);
  console.log(`Updated .env with: ${additions.map((line) => line.split("=")[0]).join(", ")}`);
}
