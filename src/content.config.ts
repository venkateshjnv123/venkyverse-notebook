import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/blog' }),
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

export const collections = { blog };
