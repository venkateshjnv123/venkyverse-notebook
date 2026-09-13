#!/usr/bin/env tsx
/**
 * new-post.ts — manual MDX scaffold script
 * venkyverse.space
 *
 * Usage:
 *   npm run new-post
 *
 * Flow:
 *   1. Enter title, tagline, tags, readTime, signoff
 *   2. LinkedIn URL (optional)
 *   3. Local image path (optional) — copied to public/images/
 *   4. Draft flag
 *   5. Paste MDX body (type END to finish)
 *   6. Writes {id}-{slug}.mdx to src/content/blog/
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

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

// ─── config ───────────────────────────────────────────────────────────────────

const CONTENT_DIR = path.resolve("src/content/blog");
// Drafts go in a subfolder so Keystatic lists them as a separate collection.
const DRAFTS_DIR = path.join(CONTENT_DIR, "_drafts");
const PUBLIC_IMAGES_DIR = path.resolve("public/images");
const VALID_TAGS = ["prod-bug", "system-design", "ai", "career", "backend"];

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
    console.log('(paste MDX, then type "END" on a new line and press Enter)\n');
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

// ─── helpers ──────────────────────────────────────────────────────────────────

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function countMdx(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith(".mdx")).length;
}

function getNextId(): string {
  const count = countMdx(CONTENT_DIR) + countMdx(DRAFTS_DIR);
  return count === 0 ? "001" : String(count + 1).padStart(3, "0");
}

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function parseTags(input: string): string[] {
  const parsed = input
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => VALID_TAGS.includes(t));

  const invalid = input
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && !VALID_TAGS.includes(t));

  if (invalid.length) {
    console.warn(`⚠️  Ignored invalid tags: ${invalid.join(", ")}`);
  }
  return parsed;
}

function copyImage(localPath: string, slug: string): string {
  const ext = path.extname(localPath).toLowerCase();
  fs.mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });
  const destName = `${slug}-hero${ext}`;
  const destPath = path.join(PUBLIC_IMAGES_DIR, destName);
  fs.copyFileSync(localPath, destPath);
  console.log(`✅ Image copied → public/images/${destName}`);
  return `/images/${destName}`;
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
  const rl = createRL();

  console.log("\n╔════════════════════════════════════════╗");
  console.log("║  venkyverse — new post                 ║");
  console.log("╚════════════════════════════════════════╝\n");
  console.log(`Valid tags: ${VALID_TAGS.join(", ")}\n`);

  const title = (await ask(rl, "Title:\n> ")).trim();
  if (!title) {
    console.error("❌ Title cannot be empty.");
    rl.close();
    process.exit(1);
  }

  const tagline = (await ask(rl, "\nTagline (one-liner lesson, max 100 chars):\n> ")).trim();

  const tagsRaw = await ask(rl, "\nTags (comma-separated):\n> ");
  const tags = parseTags(tagsRaw);
  if (!tags.length) {
    console.warn("⚠️  No valid tags — post will have empty tags array.");
  }

  const readTimeRaw = await ask(rl, "\nRead time (minutes):\n> ");
  const readTime = Math.max(1, parseInt(readTimeRaw) || 4);

  const signoff = (await ask(rl, "\nSignoff (question to prompt comments):\n> ")).trim();

  const linkedinUrl = (await ask(rl, "\nLinkedIn URL (Enter to skip):\n> ")).trim();

  const imagePathRaw = (await ask(rl, "\nPath to hero image (Enter to skip):\n> ")).trim();

  const draftInput = await ask(rl, "\nSave as draft? [y/N]\n> ");
  const isDraft = draftInput.trim().toLowerCase() === "y";

  const body = await askMultiline(rl, "\nPaste MDX body:");
  rl.close();

  if (!body.trim()) {
    console.warn("⚠️  Body is empty — post will have no content.");
  }

  const id = getNextId();
  const slug = toSlug(title);

  // Handle image
  let heroImage = "";
  if (imagePathRaw) {
    const resolved = path.resolve(imagePathRaw);
    if (!fs.existsSync(resolved)) {
      console.warn(`⚠️  Image not found: ${resolved} — skipping`);
    } else {
      heroImage = copyImage(resolved, slug);
    }
  }

  // Build MDX
  const meta: PostMeta = {
    id,
    title,
    tagline,
    tags,
    date: getTodayISO(),
    readTime,
    linkedin_url: linkedinUrl,
    hero_image: heroImage,
    draft: isDraft,
    signoff,
  };

  const mdxContent = buildMDX(meta, body);

  const targetDir = isDraft ? DRAFTS_DIR : CONTENT_DIR;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const filename = `${id}-${slug}.mdx`;
  const outputPath = path.join(targetDir, filename);

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
  console.log(`  Title   : ${title}`);
  console.log(`  Tags    : ${tags.join(", ") || "(none)"}`);
  console.log(`  Draft   : ${isDraft ? "yes — won't show in production" : "no — live on next deploy"}`);
  console.log(`  Image   : ${heroImage || "(none)"}`);
  console.log(`\n  Next steps:`);
  console.log(`  1. Review: ${outputPath}`);
  console.log(`  2. Edit body if needed`);
  console.log(`  3. git add . && git commit -m 'post: ${title}'`);
  console.log(`  4. git push → deploy\n`);
}

main().catch((err) => {
  console.error("\n❌ Unexpected error:", err);
  process.exit(1);
});
