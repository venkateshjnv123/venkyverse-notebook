#!/usr/bin/env tsx
/**
 * mcp/server.ts — venkyverse blog MCP server (stdio)
 *
 * Tools: list_posts · get_post · create_post · update_post · upload_image
 *
 * Register in .claude/settings.json:
 *   "mcpServers": {
 *     "venkyverse-blog": {
 *       "command": "npx",
 *       "args": ["tsx", "mcp/server.ts"],
 *       "cwd": "/path/to/venkyverse"
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { uploadImage } from "./firebase.js";

// ─── config ───────────────────────────────────────────────────────────────────

const CONTENT_DIR = path.resolve("src/content/blog");
// Drafts live in a subfolder so Keystatic can list them as their own
// collection. Post ids/URLs are unaffected — content.config.ts strips it.
const DRAFT_SUBDIR = "_drafts";
const DRAFTS_DIR = path.join(CONTENT_DIR, DRAFT_SUBDIR);
const VALID_TAGS = ["prod-bug", "system-design", "ai", "career", "backend"] as const;

// ─── env ──────────────────────────────────────────────────────────────────────

function loadEnv(): void {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
}

// ─── frontmatter ──────────────────────────────────────────────────────────────

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

function parseFrontmatter(content: string): { meta: PostMeta; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {} as PostMeta, body: content };

  const raw: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();

    if (val === "true") raw[key] = true;
    else if (val === "false") raw[key] = false;
    else if (/^\d+$/.test(val)) raw[key] = parseInt(val);
    else if (val.startsWith('"') && val.endsWith('"'))
      raw[key] = val.slice(1, -1).replace(/\\"/g, '"');
    else if (val.startsWith("[") && val.endsWith("]"))
      raw[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    else raw[key] = val;
  }

  return { meta: raw as PostMeta, body: match[2].trim() };
}

function buildMDX(meta: PostMeta, body: string): string {
  const tags = meta.tags.map((t) => `'${t}'`).join(", ");
  return `---
id: "${meta.id}"
title: "${meta.title.replace(/"/g, '\\"')}"
tagline: "${meta.tagline.replace(/"/g, '\\"')}"
tags: [${tags}]
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
  const count = listFiles().length;
  return count === 0 ? "001" : String(count + 1).padStart(3, "0");
}

function readDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));
}

// Relative to CONTENT_DIR, so drafts come back as "_drafts/019-foo.mdx".
function listFiles(): string[] {
  return [
    ...readDir(CONTENT_DIR),
    ...readDir(DRAFTS_DIR).map((f) => path.join(DRAFT_SUBDIR, f)),
  ].sort();
}

// The id is the bare filename (no _drafts/ prefix) — same id the site uses.
function idOf(relPath: string): string {
  return path.basename(relPath, ".mdx");
}

function findFile(id: string): string | undefined {
  return listFiles().find((f) => {
    const base = idOf(f);
    return base === id || base.startsWith(id + "-") || base.startsWith(id);
  });
}

// ─── tool handlers ────────────────────────────────────────────────────────────

function handleListPosts(args: { draft?: boolean }) {
  return listFiles().map((filename) => {
    const { meta } = parseFrontmatter(
      fs.readFileSync(path.join(CONTENT_DIR, filename), "utf-8")
    );
    return { id: idOf(filename), ...meta };
  }).filter((p) => {
    if (args.draft === true) return p.draft;
    if (args.draft === false) return !p.draft;
    return true;
  });
}

function handleGetPost(args: { id: string }) {
  const filename = findFile(args.id);
  if (!filename) throw new Error(`Post not found: ${args.id}`);
  const content = fs.readFileSync(path.join(CONTENT_DIR, filename), "utf-8");
  const { meta, body } = parseFrontmatter(content);
  return { id: idOf(filename), meta, body };
}

async function handleCreatePost(args: {
  title: string;
  tagline: string;
  tags: string[];
  readTime: number;
  signoff: string;
  body: string;
  linkedin_url?: string;
  image_path?: string;
  draft?: boolean;
}) {
  const id = getNextId();
  const slug = toSlug(args.title);
  const tags = args.tags.filter((t) => (VALID_TAGS as readonly string[]).includes(t));

  let heroImage = "";
  if (args.image_path?.trim()) {
    const resolved = path.resolve(args.image_path.trim());
    if (fs.existsSync(resolved)) {
      heroImage = await uploadImage(resolved, slug);
    } else {
      process.stderr.write(`[create_post] image not found: ${resolved}\n`);
    }
  }

  const meta: PostMeta = {
    id,
    title: args.title,
    tagline: args.tagline,
    tags,
    date: new Date().toISOString().split("T")[0],
    readTime: args.readTime,
    linkedin_url: args.linkedin_url || "",
    hero_image: heroImage,
    draft: args.draft ?? false,
    signoff: args.signoff,
  };

  const targetDir = meta.draft ? DRAFTS_DIR : CONTENT_DIR;
  fs.mkdirSync(targetDir, { recursive: true });

  const filename = `${id}-${slug}.mdx`;
  const outputPath = path.join(targetDir, filename);

  if (fs.existsSync(outputPath)) {
    fs.renameSync(outputPath, `${outputPath}.bak`);
  }

  fs.writeFileSync(outputPath, buildMDX(meta, args.body), "utf-8");

  return { id, slug, filename, path: outputPath, hero_image: heroImage };
}

async function handleUpdatePost(args: {
  id: string;
  title?: string;
  tagline?: string;
  tags?: string[];
  readTime?: number;
  signoff?: string;
  body?: string;
  linkedin_url?: string;
  hero_image?: string;
  draft?: boolean;
}) {
  const { id, body: newBody, ...updates } = args;

  const filename = findFile(id);
  if (!filename) throw new Error(`Post not found: ${id}`);

  const filePath = path.join(CONTENT_DIR, filename);
  const { meta, body } = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));

  const updatedMeta: PostMeta = { ...meta, ...updates } as PostMeta;
  if (updates.tags) {
    updatedMeta.tags = updates.tags.filter((t) => (VALID_TAGS as readonly string[]).includes(t));
  }

  // Toggling draft moves the file between blog/ and blog/_drafts/ so it lands
  // in the matching Keystatic collection. The id/URL is unchanged.
  const base = path.basename(filename);
  const targetDir = updatedMeta.draft ? DRAFTS_DIR : CONTENT_DIR;
  const targetPath = path.join(targetDir, base);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, buildMDX(updatedMeta, newBody ?? body), "utf-8");
  if (targetPath !== filePath) fs.rmSync(filePath);

  return { id, filename: base, path: targetPath };
}

async function handleUploadImage(args: { image_path: string; slug: string }) {
  const resolved = path.resolve(args.image_path);
  if (!fs.existsSync(resolved)) throw new Error(`Image not found: ${resolved}`);
  const url = await uploadImage(resolved, args.slug);
  return { url, slug: args.slug };
}

// ─── tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "list_posts",
    description: "List blog posts with metadata. Filter by draft status.",
    inputSchema: {
      type: "object",
      properties: {
        draft: { type: "boolean", description: "true = drafts only, false = published only, omit = all" },
      },
    },
  },
  {
    name: "get_post",
    description: "Get full frontmatter and MDX body of a post by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Post ID e.g. '001-webhook-race-condition'" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_post",
    description: "Create a new MDX blog post. Optionally upload hero image to Firebase.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Lowercase, max 60 chars" },
        tagline: { type: "string", description: "One-line lesson, max 100 chars" },
        tags: {
          type: "array",
          items: { type: "string", enum: [...VALID_TAGS] },
          description: "1–3 tags",
        },
        readTime: { type: "number", description: "Estimated minutes to read" },
        signoff: { type: "string", description: "Question to prompt comments" },
        body: { type: "string", description: "Full MDX body — ## sections, **bold**, > callouts" },
        linkedin_url: { type: "string" },
        image_path: { type: "string", description: "Local path to hero image (uploaded to Firebase)" },
        draft: { type: "boolean", default: false },
      },
      required: ["title", "tagline", "tags", "readTime", "signoff", "body"],
    },
  },
  {
    name: "update_post",
    description: "Update frontmatter and/or body of an existing post.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Post ID to update" },
        title: { type: "string" },
        tagline: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        readTime: { type: "number" },
        signoff: { type: "string" },
        body: { type: "string", description: "Full replacement MDX body (omit to keep existing)" },
        linkedin_url: { type: "string" },
        hero_image: { type: "string" },
        draft: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "upload_image",
    description: "Upload a local image to Firebase Storage and return its public URL.",
    inputSchema: {
      type: "object",
      properties: {
        image_path: { type: "string", description: "Absolute or relative local path to image" },
        slug: { type: "string", description: "Post slug — used as storage path prefix" },
      },
      required: ["image_path", "slug"],
    },
  },
];

// ─── server ───────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();

  const server = new Server(
    { name: "venkyverse-blog", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      let result: unknown;

      if (name === "list_posts") result = handleListPosts(args as { draft?: boolean });
      else if (name === "get_post") result = handleGetPost(args as { id: string });
      else if (name === "create_post") result = await handleCreatePost(args as Parameters<typeof handleCreatePost>[0]);
      else if (name === "update_post") result = await handleUpdatePost(args as Parameters<typeof handleUpdatePost>[0]);
      else if (name === "upload_image") result = await handleUploadImage(args as { image_path: string; slug: string });
      else throw new Error(`Unknown tool: ${name}`);

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.stderr.write(`[mcp] fatal: ${err.message}\n`);
  process.exit(1);
});
