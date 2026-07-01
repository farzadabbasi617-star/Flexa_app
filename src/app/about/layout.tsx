import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";
export const metadata = createPageMetadata({
  title:"درباره گیمنت | پلتفرم ایرانی تورنومنت و خرید و فروش اکانت بازی",
  description:"گیمنت (Gament) پلتفرم ایرانی برای تورنومنت، خرید و فروش اکانت بازی، CP کالاف، جم کلش رویال، V-Bucks فورتنایت و اکانت PS4/PS5 است.",
  path:"/about",
  keywords:["درباره گیمنت","پلتفرم تورنومنت ایران","گیمینگ ایران","اسپورت ایران","پلتفرم خرید و فروش اکانت بازی"],
});
export default function Layout({children}:{children:ReactNode}){return children;}
