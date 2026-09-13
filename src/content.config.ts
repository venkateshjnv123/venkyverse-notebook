import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  // Drafts live in blog/_drafts/ so Keystatic can list them as their own
  // collection. The id stays the bare filename either way, so a post keeps its
  // URL when it moves between the two folders.
  loader: glob({
    pattern: '**/*.mdx',
    base: './src/content/blog',
    generateId: ({ entry }) => entry.replace(/^_drafts\//, '').replace(/\.mdx$/, ''),
  }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    tagline: z.string(),
    tags: z.array(z.string()),
    date: z.date(),
    readTime: z.number(),
    linkedin_url: z.string().optional(),
    hero_image: z.string().optional(),
    draft: z.boolean().default(false),
    signoff: z.string(),
  }),
});

const interviews = defineCollection({
  loader: glob({
    pattern: '**/*.mdx',
    base: './src/content/interviews',
    generateId: ({ entry }) => entry.replace(/^_drafts\//, '').replace(/\.mdx$/, ''),
  }),
  schema: z.object({
    company: z.string(),
    role: z.string(),
    tagline: z.string(),
    date: z.date(),
    // 'offer' | 'rejected' | 'withdrawn' | 'in-progress'
    verdict: z.enum(['offer', 'rejected', 'withdrawn', 'in-progress']),
    verdictNote: z.string().optional(),
    mode: z.string().optional(),
    readTime: z.number().default(4),
    rounds: z
      .array(
        z.object({
          n: z.number(),
          name: z.string(),
          topics: z.array(z.string()).default([]),
          questions: z
            .array(z.object({ title: z.string(), url: z.string().optional() }))
            .default([]),
          outcome: z.string().optional(),
        }),
      )
      .default([]),
    draft: z.boolean().default(false),
    signoff: z.string().optional(),
  }),
});

export const collections = { blog, interviews };
