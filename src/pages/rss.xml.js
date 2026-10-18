import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
export async function GET(context) {
  const posts = (await getCollection('writing', p => !p.data.draft)).sort((a, b) => b.data.date - a.data.date);
  return rss({
    title: 'Gaege Root — Field Notes',
    description: 'Notes on cloud, platform, and systems engineering.',
    site: context.site,
    items: posts.map(p => ({ title: p.data.title, description: p.data.description, pubDate: p.data.date, link: `/writing/${p.id}/` })),
  });
}
