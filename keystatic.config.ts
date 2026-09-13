import { config, fields, collection, singleton } from '@keystatic/core';
import { wrapper, mark, block } from '@keystatic/core/content-components';

// Custom MDX components usable inside the post body editor. These serialize to
// <Callout>, <Aside>, <Diagram>, <Highlight> JSX in the .mdx file — no import
// lines needed; writing/[slug].astro passes the real components to <Content>.
const contentComponents = {
  Callout: wrapper({
    label: 'Callout',
    schema: {
      type: fields.select({
        label: 'Type',
        options: [
          { label: 'Info', value: 'info' },
          { label: 'Warning', value: 'warning' },
          { label: 'Success', value: 'success' },
        ],
        defaultValue: 'info',
      }),
      label: fields.text({ label: 'Label' }),
    },
  }),
  Aside: wrapper({
    label: 'Aside',
    schema: {},
  }),
  Diagram: wrapper({
    label: 'Diagram',
    schema: {
      caption: fields.text({ label: 'Caption' }),
      src: fields.text({ label: 'Image src (optional, e.g. /images/x.png)' }),
      alt: fields.text({ label: 'Alt text' }),
    },
  }),
  Mermaid: block({
    label: 'Mermaid diagram',
    schema: {
      code: fields.text({
        label: 'Mermaid source',
        description: 'e.g. flowchart TD\\n  A --> B',
        multiline: true,
      }),
    },
  }),
  Highlight: mark({
    label: 'Highlight',
    schema: {},
  }),
};

// Local mode: reads/writes the repo filesystem. Run `npm run dev` and open
// http://localhost:4321/keystatic to author posts. Saving writes the .mdx
// file into src/content/blog/ — commit + push to deploy.
// Both post collections share one schema — only the `draft` default differs.
const postSchema = (draftDefault: boolean) =>
  ({
        id: fields.text({
          label: 'ID',
          description: '3-digit string, e.g. 006 — drives №-numbering in UI',
          validation: { isRequired: true },
        }),
        title: fields.slug({
          name: { label: 'Title', validation: { isRequired: true } },
          slug: {
            label: 'Filename slug',
            description: 'e.g. 006-webhook-race — becomes {slug}.mdx',
          },
        }),
        tagline: fields.text({
          label: 'Tagline',
          description: 'Italic subhead shown in archive',
          validation: { isRequired: true },
        }),
        tags: fields.array(
          fields.select({
            label: 'Tag',
            options: [
              { label: 'prod-bug', value: 'prod-bug' },
              { label: 'system-design', value: 'system-design' },
              { label: 'ai', value: 'ai' },
              { label: 'career', value: 'career' },
              { label: 'backend', value: 'backend' },
              { label: 'opinion', value: 'opinion' },
              { label: 'patterns', value: 'patterns' },
            ],
            defaultValue: 'prod-bug',
          }),
          { label: 'Tags', itemLabel: (p) => p.value },
        ),
        date: fields.date({
          label: 'Date',
          validation: { isRequired: true },
        }),
        readTime: fields.integer({
          label: 'Read time (minutes)',
          validation: { isRequired: true },
        }),
        linkedin_url: fields.url({
          label: 'LinkedIn URL',
          description: 'Optional cross-post link',
        }),
        hero_image: fields.image({
          label: 'Hero image',
          description: 'Uploaded to /public/images',
          directory: 'public/images',
          publicPath: '/images/',
        }),
        draft: fields.checkbox({ label: 'Draft', defaultValue: draftDefault }),
        signoff: fields.text({
          label: 'Signoff',
          description: 'CTA question shown at end of post',
          multiline: true,
          validation: { isRequired: true },
        }),
        content: fields.mdx({
          label: 'Body',
          description: 'Post body. Drag-drop images inline → /public/images',
          options: {
            image: {
              directory: 'public/images',
              publicPath: '/images/',
            },
          },
          components: contentComponents,
        }),
  }) as const;

export default config({
  storage: { kind: 'local' },
  ui: {
    brand: { name: 'venkyverse' },
    navigation: {
      Content: ['blog', 'drafts', 'interviews'],
      Data: ['books'],
    },
  },
  collections: {
    // Published posts: src/content/blog/*.mdx (the `*` glob is one segment, so
    // _drafts/ entries never show up here).
    blog: collection({
      label: 'Blog posts',
      slugField: 'title',
      path: 'src/content/blog/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      columns: ['title', 'date'],
      schema: postSchema(false),
    }),
    // Drafts: src/content/blog/_drafts/*.mdx. Same URL/id as a published post
    // (content.config.ts strips the _drafts/ prefix), so publishing = move the
    // file up one folder and untick Draft.
    drafts: collection({
      label: 'Drafts',
      slugField: 'title',
      path: 'src/content/blog/_drafts/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      columns: ['title', 'date'],
      schema: postSchema(true),
    }),
    // Interview experiences: src/content/interviews/*.mdx → /interviews/{slug}
    interviews: collection({
      label: 'Interview experiences',
      slugField: 'company',
      path: 'src/content/interviews/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      columns: ['company', 'date'],
      schema: {
        company: fields.slug({
          name: { label: 'Company', validation: { isRequired: true } },
          slug: {
            label: 'Filename slug',
            description: 'e.g. kotak-sde2 — becomes {slug}.mdx and the URL',
          },
        }),
        role: fields.text({
          label: 'Role',
          description: 'e.g. SDE-2',
          validation: { isRequired: true },
        }),
        tagline: fields.text({
          label: 'Tagline',
          description: 'Italic subhead shown on the card and post header',
          validation: { isRequired: true },
        }),
        date: fields.date({ label: 'Date', validation: { isRequired: true } }),
        verdict: fields.select({
          label: 'Verdict',
          options: [
            { label: 'Offer', value: 'offer' },
            { label: 'Rejected', value: 'rejected' },
            { label: 'Withdrawn', value: 'withdrawn' },
            { label: 'In progress', value: 'in-progress' },
          ],
          defaultValue: 'rejected',
        }),
        verdictNote: fields.text({
          label: 'Verdict note',
          description: 'Optional — overrides the pill text, e.g. "Rejected after R2"',
        }),
        mode: fields.text({ label: 'Mode', description: 'e.g. Virtual, Onsite' }),
        readTime: fields.integer({ label: 'Read time (minutes)', defaultValue: 4 }),
        rounds: fields.array(
          fields.object({
            n: fields.integer({ label: 'Round number', validation: { isRequired: true } }),
            name: fields.text({
              label: 'Round name',
              description: 'e.g. DSA, LLD + System Design, Hiring Manager',
              validation: { isRequired: true },
            }),
            topics: fields.array(fields.text({ label: 'Topic' }), {
              label: 'Topics',
              itemLabel: (p) => p.value,
            }),
            questions: fields.array(
              fields.object({
                title: fields.text({ label: 'Question', validation: { isRequired: true } }),
                url: fields.url({ label: 'Link (optional)', description: 'e.g. LeetCode URL' }),
              }),
              { label: 'Questions', itemLabel: (p) => p.fields.title.value || 'Question' },
            ),
            outcome: fields.text({ label: 'Outcome', description: 'e.g. Cleared, Rejected here' }),
          }),
          { label: 'Rounds', itemLabel: (p) => `R${p.fields.n.value ?? ''} · ${p.fields.name.value || ''}` },
        ),
        draft: fields.checkbox({ label: 'Draft', defaultValue: false }),
        signoff: fields.text({
          label: 'Signoff',
          description: 'CTA question shown at end of the write-up',
          multiline: true,
        }),
        content: fields.mdx({
          label: 'Body',
          description: 'The narrative. Round cards render from the Rounds field above.',
          options: { image: { directory: 'public/images', publicPath: '/images/' } },
          components: contentComponents,
        }),
      },
    }),
  },
  singletons: {
    // Edits src/data/books.json. Drag-drop a cover → /public/images/covers.
    // book.cover is used directly as <img src> in the books page.
    books: singleton({
      label: 'Books',
      path: 'src/data/books',
      format: { data: 'json' },
      schema: {
        books: fields.array(
          fields.object({
            id: fields.text({ label: 'ID (slug)', validation: { isRequired: true } }),
            title: fields.text({ label: 'Title', validation: { isRequired: true } }),
            author: fields.text({ label: 'Author' }),
            cover: fields.image({
              label: 'Cover',
              directory: 'public/images/covers',
              publicPath: '/images/covers/',
            }),
          }),
          { label: 'Books', itemLabel: (p) => p.fields.title.value || 'Untitled' },
        ),
      },
    }),
  },
});
