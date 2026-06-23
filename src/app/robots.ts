import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://gament1.ir';

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/tournaments',
          '/tournaments/*',
          '/leaderboard',
          '/teams',
          '/teams/*',
          '/achievements',
          '/achievements/*',
          '/honors',
          '/honors/*',
          '/profile/*',
          '/players',
          '/matches/*',
          '/about',
          '/faq',
          '/rules',
          '/contact',
          '/guide',
        ],
        disallow: [
          '/api/',
          '/admin/',
          '/_next/',
          '/login',
          '/register',
          '/dashboard',
          '/settings',
          '/payment',
          '/notifications',
          '/wallet',
          '/judging',
          '/support',
          '/admin/*',
          '/api/*',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: [
          '/',
          '/tournaments',
          '/tournaments/*',
          '/leaderboard',
          '/teams',
          '/achievements',
          '/honors',
          '/profile/*',
          '/players',
        ],
        disallow: [
          '/api/',
          '/admin/',
          '/login',
          '/register',
          '/dashboard',
          '/settings',
          '/payment',
          '/wallet',
          '/judging',
        ],
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/login', '/register'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
