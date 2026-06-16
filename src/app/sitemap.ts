import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://flexa.app';

  const routes = [
    '',
    '/about',
    '/contact',
    '/privacy',
    '/faq',
    '/tournaments',
    '/leaderboard',
    '/wallet',
    '/profile',
    '/guide/tournaments',
    '/guide/wallet',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1 : 0.8,
  }));
}
