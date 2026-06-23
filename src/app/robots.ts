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
          '/players',
          '/profile/*',
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
          '/wallet',
          '/judging',
          '/support',
          '/notifications',
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
          '/players',
          '/profile/*',
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
        disallow: ['/api/', '/admin/', '/login', '/register', '/dashboard'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
