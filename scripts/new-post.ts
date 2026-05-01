#!/usr/bin/env tsx
/**
 * new-post.ts — LinkedIn → MDX automation script
 * venkyverse.space
 *
 * Usage:
 *   npm run new-post
 *
 * Supports:
 *   - Claude API (claude-sonnet-4-6)
 *   - OpenAI GPT-4o
 *
 * Flow:
 *   1. Choose AI provider
 *   2. Paste LinkedIn post text
 *   3. Add image paths (optional)
 *   4. AI formats → title, tagline, tags, readTime, body (MDX), signoff
 *   5. Upload images to Firebase Storage (if FIREBASE_SERVICE_ACCOUNT_PATH set)
 *   6. Write .mdx file to src/content/blog/
 *   7. Done ✅
 *
 * Env vars required (in .env):
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   OPENAI_API_KEY=sk-...
 *   FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
 *   FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as https from "https";

// ─── types ────────────────────────────────────────────────────────────────────

interface PostMeta {
  id: string;
  title: string;
  tagline: string;
  tags: string[];
  date: string;
  readTime: number;
  linkedin_url: string;
  hero_image: string;
  draft: boolean;
  signoff: string;
}

type Provider = "claude" | "gpt";

// ─── config ───────────────────────────────────────────────────────────────────

const CONTENT_DIR = path.resolve("src/content/blog");
const VALID_TAGS = ["prod-bug", "system-design", "ai", "career", "backend"];

// Load .env manually (no dotenv dependency needed)
function loadEnv(): void {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length) {
      process.env[key.trim()] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

// ─── readline helpers ─────────────────────────────────────────────────────────

function createRL(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function askMultiline(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    console.log(prompt);
    console.log('(paste your text, then type "END" on a new line and press Enter)\n');
    const lines: string[] = [];
    const handler = (line: string) => {
      if (line.trim() === "END") {
        rl.removeListener("line", handler);
        resolve(lines.join("\n"));
      } else {
        lines.push(line);
      }
    };
    rl.on("line", handler);
  });
}

// ─── http helper ──────────────────────────────────────────────────────────────

function httpsPost(
  hostname: string,
  urlPath: string,
  headers: Record<string, string>,
  body: object
): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        port: 443,
        path: urlPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => resolve(raw));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ─── prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a technical writing assistant for a backend engineer's personal blog.
You convert raw LinkedIn posts into structured blog posts in MDX format.
The author's voice is: direct, honest, learning-in-public, lowercase titles, no corporate fluff.
Always return ONLY valid JSON. No markdown fences, no preamble, no explanation.`;

const userPrompt = (postText: string) => `
Convert this LinkedIn post into a structured blog post.

POST TEXT:
"""
${postText}
"""

Return a JSON object with EXACTLY these fields:
{
  "title": "lowercase, conversational, max 60 chars — mirrors the author's voice",
  "tagline": "one-line lesson the reader takes away, max 100 chars",
  "tags": ["1-3 tags from exactly: prod-bug, system-design, ai, career, backend"],
  "readTime": <integer minutes>,
  "signoff": "one engaging question to prompt reader comments, casual tone",
  "body": "full MDX body — use ## for sections, **bold** for key terms, > for callouts, keep informal voice, expand with context and structure but don't pad. Include a '## the lesson' section at end."
}

Rules:
- title lowercase (except acronyms: AI, MDX, API, etc.)
- tags only from allowed list
- body 400-800 words
- raw JSON only, no markdown fences
`;

// ─── AI providers ─────────────────────────────────────────────────────────────

async function callClaude(postText: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in .env");

  console.log("\n⏳ Calling Claude API...");

  const raw = await httpsPost(
    "api.anthropic.com",
    "/v1/messages",
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    {
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(postText) }],
    }
  );

  const response = JSON.parse(raw);
  if (response.error) throw new Error(`Claude API error: ${response.error.message}`);

  const content = response.content?.[0]?.text;
  if (!content) throw new Error("Claude returned empty content");

  return JSON.parse(content.replace(/```json|```/g, "").trim());
}

async function callGPT(postText: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set in .env");

  console.log("\n⏳ Calling GPT-4o API...");

  const raw = await httpsPost(
    "api.openai.com",
    "/v1/chat/completions",
    { Authorization: `Bearer ${apiKey}` },
    {
      model: "gpt-4o",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(postText) },
      ],
    }
  );

  const response = JSON.parse(raw);
  if (response.error) throw new Error(`OpenAI API error: ${response.error.message}`);

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("GPT returned empty content");

  return JSON.parse(content.replace(/```json|```/g, "").trim());
}

// ─── firebase upload ──────────────────────────────────────────────────────────

async function uploadToFirebase(localPath: string, slug: string): Promise<string> {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!bucket || !serviceAccountPath || !fs.existsSync(path.resolve(serviceAccountPath))) {
    console.warn("⚠️  Firebase service account not found — skipping image upload");
    return "";
  }

  try {
    // firebase-admin is optional — only needed for image uploads
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require("firebase-admin");

    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), "utf-8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: bucket,
      });
    }

    const storageBucket = admin.storage().bucket();
    const ext = path.extname(localPath);
    const dest = `images/${slug}/hero${ext}`;

    console.log(`📤 Uploading ${localPath} → gs://${bucket}/${dest}`);

    await storageBucket.upload(localPath, {
      destination: dest,
      metadata: { contentType: `image/${ext.replace(".", "")}` },
      public: true,
    });

    const file = storageBucket.file(dest);
    const [url] = await file.getSignedUrl({ action: "read", expires: "03-01-2500" });

    console.log(`✅ Uploaded: ${url}`);
    return url;
  } catch (err) {
    console.warn("⚠️  Firebase upload failed:", (err as Error).message);
    return "";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function getNextId(): string {
  if (!fs.existsSync(CONTENT_DIR)) return "001";
  const count = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".mdx")).length;
  return String(count + 1).padStart(3, "0");
}

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function validateAIOutput(raw: Record<string, unknown>): void {
  for (const field of ["title", "tagline", "tags", "readTime", "signoff", "body"]) {
    if (!raw[field]) throw new Error(`AI output missing field: ${field}`);
  }
  if (!Array.isArray(raw.tags)) throw new Error("tags must be an array");

  const invalid = (raw.tags as string[]).filter((t) => !VALID_TAGS.includes(t));
  if (invalid.length) {
    console.warn(`⚠️  Stripping invalid tags: ${invalid.join(", ")}`);
    raw.tags = (raw.tags as string[]).filter((t) => VALID_TAGS.includes(t));
  }
  if (typeof raw.readTime !== "number") {
    raw.readTime = parseInt(String(raw.readTime)) || 4;
  }
}

function buildMDX(meta: PostMeta, body: string): string {
  const tagsFormatted = meta.tags.map((t) => `'${t}'`).join(", ");
  return `---
id: "${meta.id}"
title: "${meta.title.replace(/"/g, '\\"')}"
tagline: "${meta.tagline.replace(/"/g, '\\"')}"
tags: [${tagsFormatted}]
date: ${meta.date}
readTime: ${meta.readTime}
linkedin_url: "${meta.linkedin_url}"
hero_image: "${meta.hero_image}"
draft: ${meta.draft}
signoff: "${meta.signoff.replace(/"/g, '\\"')}"
---

${body.trim()}
`;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnv();
  const rl = createRL();

  console.log("\n╔════════════════════════════════════════╗");
  console.log("║  venkyverse — new post  🖊️              ║");
  console.log("╚════════════════════════════════════════╝\n");

  const providerInput = await ask(rl, "AI provider? [1] Claude (default)  [2] GPT-4o\n> ");
  const provider: Provider = providerInput.trim() === "2" ? "gpt" : "claude";
  console.log(`\n→ Using ${provider === "claude" ? "Claude (Anthropic)" : "GPT-4o (OpenAI)"}\n`);

  const postText = await askMultiline(rl, "Paste your LinkedIn post text:");
  if (!postText.trim()) {
    console.error("❌ Post text cannot be empty.");
    rl.close();
    process.exit(1);
  }

  const linkedinUrl = await ask(rl, "\nLinkedIn post URL (Enter to skip):\n> ");
  const imagePath = await ask(rl, "\nPath to hero image (Enter to skip):\n> ");
  const draftInput = await ask(rl, "\nSave as draft? [y/N]\n> ");
  const isDraft = draftInput.trim().toLowerCase() === "y";

  rl.close();

  // Call AI
  let aiOutput: Record<string, unknown>;
  try {
    aiOutput = provider === "claude" ? await callClaude(postText) : await callGPT(postText);
    validateAIOutput(aiOutput);
  } catch (err) {
    console.error("\n❌ AI call failed:", (err as Error).message);
    process.exit(1);
  }

  const id = getNextId();
  const slug = toSlug(String(aiOutput.title));

  // Upload image if provided
  let heroImageUrl = "";
  if (imagePath?.trim()) {
    if (!fs.existsSync(imagePath.trim())) {
      console.warn(`⚠️  Image not found at: ${imagePath.trim()} — skipping`);
    } else {
      heroImageUrl = await uploadToFirebase(imagePath.trim(), slug);
    }
  }

  // Build + write MDX
  const meta: PostMeta = {
    id,
    title: String(aiOutput.title),
    tagline: String(aiOutput.tagline),
    tags: aiOutput.tags as string[],
    date: getTodayISO(),
    readTime: Number(aiOutput.readTime),
    linkedin_url: linkedinUrl.trim() || "",
    hero_image: heroImageUrl,
    draft: isDraft,
    signoff: String(aiOutput.signoff),
  };

  const mdxContent = buildMDX(meta, String(aiOutput.body));

  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });

  // Filename: {id}-{slug}.mdx  (matches existing pattern: 001-webhook-race-condition.mdx)
  const filename = `${id}-${slug}.mdx`;
  const outputPath = path.join(CONTENT_DIR, filename);

  if (fs.existsSync(outputPath)) {
    console.warn(`\n⚠️  File exists: ${outputPath} — renaming to .bak`);
    fs.renameSync(outputPath, `${outputPath}.bak`);
  }

  fs.writeFileSync(outputPath, mdxContent, "utf-8");

  console.log("\n╔════════════════════════════════════════╗");
  console.log("║  ✅ Post created!                       ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n  File    : ${outputPath}`);
  console.log(`  ID      : ${id}`);
  console.log(`  Slug    : ${slug}`);
  console.log(`  Title   : ${meta.title}`);
  console.log(`  Tags    : ${meta.tags.join(", ")}`);
  console.log(`  Draft   : ${isDraft ? "yes — won't show in production" : "no — live on next deploy"}`);
  console.log(`  Image   : ${heroImageUrl || "(none)"}`);
  console.log(`\n  Next steps:`);
  console.log(`  1. Review: ${outputPath}`);
  console.log(`  2. Edit body if needed`);
  console.log(`  3. git add . && git commit -m 'post: ${meta.title}'`);
  console.log(`  4. git push → deploy\n`);
}

main().catch((err) => {
  console.error("\n❌ Unexpected error:", err);
  process.exit(1);
});
