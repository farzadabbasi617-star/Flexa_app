import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
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
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/login',
          '/register',
          '/dashboard',
        ],
      },
    ],
    sitemap: 'https://gament1.ir/sitemap.xml',
    host: 'https://gament1.ir',
  };
}
