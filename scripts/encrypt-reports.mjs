// Encrypt data/reports.json → data/reports.enc.json with a password.
// Run locally; the password is read from the REPORTS_PASSWORD env var so it
// never lands in a file, the repo, or a chat log. Only the encrypted blob is
// ever deployed — the plaintext reports.json must NOT be published.
//
//   REPORTS_PASSWORD='your secret' node scripts/encrypt-reports.mjs
//
// Scheme (must match frontend src/lib/vault.ts): PBKDF2-SHA256 (200k iters,
// 16-byte salt) → AES-256-GCM (12-byte IV); blob.ct = ciphertext || 16-byte tag.
import { readFile, writeFile } from "node:fs/promises";
import { pbkdf2Sync, randomBytes, createCipheriv } from "node:crypto";

const password = process.env.REPORTS_PASSWORD;
if (!password) {
  console.error("Set REPORTS_PASSWORD, e.g.  REPORTS_PASSWORD='…' node scripts/encrypt-reports.mjs");
  process.exit(1);
}

const plaintext = await readFile(new URL("../data/reports.json", import.meta.url));

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, 200_000, 32, "sha256");

const cipher = createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag(); // 16 bytes, appended so WebCrypto can verify

const blob = {
  v: 1,
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  ct: Buffer.concat([ct, tag]).toString("base64"),
};

await writeFile(new URL("../data/reports.enc.json", import.meta.url), JSON.stringify(blob));
console.log(`Wrote data/reports.enc.json (${blob.ct.length} b64 chars). Do NOT deploy data/reports.json.`);
