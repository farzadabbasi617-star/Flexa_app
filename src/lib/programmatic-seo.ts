import { absoluteUrl } from "@/lib/seo";

export type SeoGameId = "cod_mobile" | "fortnite" | "clash_royale";
export type SeoCluster = "tournaments" | "store" | "guides" | "leaderboards";
export type LeaderboardMetric = "rating" | "wins" | "win-rate";

export type ProgrammaticDataFilter =
  | { source: "tournaments"; freeOnly?: boolean; completedOnly?: boolean; modeTerms?: string[] }
  | { source: "store"; kind: "account" | "currency"; currencyKind?: string }
  | { source: "leaderboard"; metric: LeaderboardMetric }
  | { source: "latest-tournaments" };

export type ProgrammaticSeoPage = {
  gameSlug: string;
  gameId: SeoGameId;
  gameName: string;
  gameEnglishName: string;
  cluster: SeoCluster;
  facet: string;
  label: string;
  title: string;
  metaTitle: string;
  description: string;
  intro: string;
  sections: Array<{ heading: string; body: string }>;
  checklist: string[];
  faqs: Array<{ question: string; answer: string }>;
  keywords: string[];
  icon: string;
  accent: string;
  dataFilter: ProgrammaticDataFilter;
  primaryCta: { label: string; href: string };
};

type GameProfile = {
  slug: string;
  id: SeoGameId;
  name: string;
  englishName: string;
  icon: string;
  accent: string;
  identityCheck: string;
  competitionFacts: string;
  safetyNote: string;
  currencyName: string;
  currencySlug: string;
  currencyKind: string;
  specialGuideSlug: string;
  specialGuideLabel: string;
};

const GAMES: GameProfile[] = [
  {
    slug: "call-of-duty-mobile",
    id: "cod_mobile",
    name: "کالاف دیوتی موبایل",
    englishName: "Call of Duty Mobile",
    icon: "/icons/icon-cod_mobile.png",
    accent: "from-orange-500 to-red-700",
    identityCheck: "UID، نام داخل بازی و ریجن Global یا Garena",
    competitionFacts: "نوع تیم Solo/Duo/Squad، مپ، زاویه دید FPP/TPP، زمان Check-in و قوانین رکورد ضدچیت",
    safetyNote: "اطلاعات Room و Password فقط بعد از احراز شرایط و در زمان تعیین‌شده برای عضو مجاز نمایش داده می‌شود.",
    currencyName: "CP کالاف موبایل",
    currencySlug: "cp",
    currencyKind: "cp",
    specialGuideSlug: "custom-room-check-in",
    specialGuideLabel: "چک‌این و ورود به کاستوم‌روم کالاف",
  },
  {
    slug: "fortnite",
    id: "fortnite",
    name: "فورتنایت",
    englishName: "Fortnite",
    icon: "/icons/icon-fortnite.png",
    accent: "from-purple-500 to-pink-700",
    identityCheck: "Epic ID، نام بازیکن، پلتفرم و اطلاعات قابل‌تحویل اکانت",
    competitionFacts: "مود Battle Royale یا Creative، حالت Solo/Duo/Squad، قوانین لابی، زمان شروع و شیوه ثبت نتیجه",
    safetyNote: "قبل از معامله باید روش تحویل، امکان تغییر ایمیل، مالکیت اولیه و تصاویر واقعی آیتم‌های اکانت بررسی شود.",
    currencyName: "V-Bucks فورتنایت",
    currencySlug: "v-bucks",
    currencyKind: "vbucks",
    specialGuideSlug: "competitive-preparation",
    specialGuideLabel: "آمادگی برای مسابقات فورتنایت",
  },
  {
    slug: "clash-royale",
    id: "clash_royale",
    name: "کلش رویال",
    englishName: "Clash Royale",
    icon: "/icons/icon-clash_royale.png",
    accent: "from-cyan-500 to-blue-700",
    identityCheck: "Player Tag، نام داخل بازی و اتصال معتبر پروفایل کلش رویال",
    competitionFacts: "دوئل 1v1، تورنومنت خصوصی، جدول رتبه‌بندی، سطح کارت‌ها و نتیجه تأییدشده هر راند",
    safetyNote: "در رقابت‌های خصوصی، نتیجه نهایی از Leaderboard و مدرک مسابقه بررسی می‌شود و لینک دوستی فقط در جریان مجاز مسابقه استفاده می‌شود.",
    currencyName: "جم کلش رویال",
    currencySlug: "gems",
    currencyKind: "gem",
    specialGuideSlug: "one-vs-one-preparation",
    specialGuideLabel: "آمادگی برای دوئل 1v1 کلش رویال",
  },
];

type PageSeed = Omit<
  ProgrammaticSeoPage,
  "gameSlug" | "gameId" | "gameName" | "gameEnglishName" | "icon" | "accent" | "metaTitle"
> & { metaTitle?: string };

function page(game: GameProfile, seed: PageSeed): ProgrammaticSeoPage {
  return {
    ...seed,
    gameSlug: game.slug,
    gameId: game.id,
    gameName: game.name,
    gameEnglishName: game.englishName,
    icon: game.icon,
    accent: game.accent,
    metaTitle: seed.metaTitle || seed.title,
  };
}

function tournamentPages(game: GameProfile): ProgrammaticSeoPage[] {
  const activeHref = game.id === "cod_mobile" ? "/cod-arena" : `/tournaments?game=${game.id}`;

  return [
    page(game, {
      cluster: "tournaments",
      facet: "online",
      label: `مسابقات آنلاین ${game.name}`,
      title: `تورنومنت آنلاین ${game.name}؛ مسابقات فعال، قوانین و جایزه`,
      description: `فهرست تورنومنت‌های آنلاین ${game.name} در گیمنت با اطلاعات واقعی ظرفیت، ورودیه، جایزه، زمان شروع، قوانین و نتایج به‌روز.`,
      intro: `این صفحه برای کسی ساخته شده که می‌خواهد به‌جای جست‌وجوی چند کانال و گروه، مسابقات آنلاین ${game.name} را با اطلاعات قابل بررسی در یک مسیر ببیند. هر رویداد منتشرشده به صفحه مستقل خودش متصل است تا ظرفیت، وضعیت ثبت‌نام، زمان شروع و نتیجه‌های ثبت‌شده را قبل از تصمیم‌گیری بررسی کنی.`,
      sections: [
        {
          heading: `چه اطلاعاتی از مسابقه ${game.name} می‌بینی؟`,
          body: `کارت هر رقابت فقط یک عنوان تبلیغاتی نیست. ${game.competitionFacts} در صفحه جزئیات نمایش داده می‌شود. تعداد شرکت‌کنندگان، وضعیت ثبت‌نام، ساختار جایزه و قوانین اختصاصی همان مسابقه نیز از داده زنده گیمنت خوانده می‌شود.`,
        },
        {
          heading: "چطور مسابقه مناسب را انتخاب کنی؟",
          body: `ابتدا زمان شروع و ظرفیت باقیمانده را بررسی کن؛ سپس ورودیه را با موجودی کیف پول و جایزه احتمالی مقایسه کن. اگر مسابقه مود یا شرایط فنی مشخصی دارد، مطمئن شو پروفایل بازی تو با آن سازگار است. ${game.identityCheck} باید دقیق و متعلق به همان بازیکن باشد.`,
        },
        {
          heading: "ثبت نتیجه و داوری قابل پیگیری",
          body: `پس از شروع مسابقه، نتیجه از مسیر همان رویداد ثبت می‌شود و در صورت اختلاف، مدرک برای داوری نگه داشته خواهد شد. ${game.safetyNote} صفحه رویداد بعد از پایان حذف نمی‌شود؛ در صورت وجود نتیجه معتبر، به آرشیو مسابقه تبدیل می‌شود تا سابقه بازیکنان و برندگان قابل پیگیری بماند.`,
        },
      ],
      checklist: ["بررسی زمان شروع و مهلت Check-in", "خواندن قوانین و مود مسابقه", "کنترل ظرفیت و ورودیه", "ثبت آیدی صحیح بازی", "نگهداری مدرک نتیجه تا پایان داوری"],
      faqs: [
        { question: `از کجا مسابقات فعال ${game.name} را ببینم؟`, answer: `در همین صفحه رویدادهای مرتبط به‌صورت خودکار از دیتابیس گیمنت نمایش داده می‌شوند و هر کارت به صفحه جزئیات رسمی مسابقه لینک دارد.` },
        { question: "آیا نتیجه مسابقات قدیمی هم باقی می‌ماند؟", answer: "اگر مسابقه دارای نتیجه و داده معتبر باشد، صفحه آن به‌عنوان آرشیو باقی می‌ماند و وضعیت آن از ثبت‌نام به پایان‌یافته تغییر می‌کند." },
        { question: "اطلاعات خصوصی لابی عمومی می‌شود؟", answer: `خیر. ${game.safetyNote}` },
      ],
      keywords: [`تورنومنت ${game.name}`, `مسابقات آنلاین ${game.name}`, `${game.englishName} tournament`, "مسابقات گیمینگ با جایزه"],
      dataFilter: { source: "tournaments" },
      primaryCta: { label: "مشاهده مسابقات فعال", href: activeHref },
    }),
    page(game, {
      cluster: "tournaments",
      facet: "free",
      label: `تورنومنت رایگان ${game.name}`,
      title: `تورنومنت رایگان ${game.name}؛ ثبت‌نام بدون ورودیه`,
      description: `مسابقات رایگان ${game.name} در گیمنت؛ مشاهده ظرفیت، زمان، قوانین، جایزه احتمالی و ثبت‌نام بدون پرداخت ورودیه.`,
      intro: `تورنومنت رایگان برای شروع رقابت رسمی، شناخت روند Check-in و ساخت سابقه بازیکن مناسب است. این صفحه فقط رویدادهایی را جدا می‌کند که در داده مسابقه ورودیه آن‌ها رایگان ثبت شده است؛ بنابراین یک فیلتر ساختگی یا فهرست دستی نیست و با تغییر وضعیت رویداد به‌روزرسانی می‌شود.`,
      sections: [
        {
          heading: "رایگان بودن دقیقاً یعنی چه؟",
          body: `در رویداد رایگان مبلغی بابت ورود از کیف پول کسر نمی‌شود. بااین‌حال قوانین حضور، محدودیت ظرفیت، زمان شروع و ثبت مدرک همچنان معتبر است. جایزه ممکن است توسط گیمنت یا اسپانسر تأمین شود و مبلغ آن باید داخل صفحه رسمی همان مسابقه نوشته شده باشد.`,
        },
        {
          heading: `شرایط فنی مسابقه رایگان ${game.name}`,
          body: `رایگان بودن به معنی بی‌قانون بودن نیست. ${game.competitionFacts} را قبل از ثبت‌نام بخوان و فقط وقتی وارد شو که در زمان اعلام‌شده امکان حضور داری. No-show می‌تواند ظرفیت بازیکن دیگری را هدر بدهد و روی سابقه رقابتی حساب اثر بگذارد.`,
        },
        {
          heading: "از مسابقه رایگان برای ساخت سابقه استفاده کن",
          body: `نتیجه تأییدشده می‌تواند در پروفایل و رتبه‌بندی بازیکن اثر بگذارد. برای ساخت پروفایل باکیفیت، ${game.identityCheck} را درست ثبت کن و مدرک نتیجه را تا نهایی‌شدن داوری نگه دار. صفحات خالی و ثبت‌نام‌های بدون نتیجه به‌تنهایی ارزش رتبه‌بندی ایجاد نمی‌کنند.`,
        },
      ],
      checklist: ["صفر بودن ورودیه در صفحه رسمی", "وجود ظرفیت خالی", "سازگاری ریجن و مود", "امکان حضور در زمان Check-in", "مطالعه سیاست No-show"],
      faqs: [
        { question: "آیا مسابقه رایگان می‌تواند جایزه داشته باشد؟", answer: "بله؛ در صورتی که جایزه توسط پلتفرم یا اسپانسر تأمین شده باشد. مبلغ و شرایط پرداخت باید در صفحه همان رویداد درج شده باشد." },
        { question: "برای مسابقه رایگان هم حساب گیمنت لازم است؟", answer: "برای ثبت هویت بازیکن، Check-in، ثبت نتیجه و جلوگیری از ثبت‌نام تکراری به حساب معتبر نیاز است." },
        { question: "چرا بعضی وقت‌ها این فهرست خالی است؟", answer: "این صفحه فقط رویداد رایگان واقعی را نشان می‌دهد. اگر مسابقه‌ای با این شرایط منتشر نشده باشد، رویداد جعلی یا تکراری برای پرکردن صفحه ساخته نمی‌شود." },
      ],
      keywords: [`تورنومنت رایگان ${game.name}`, `مسابقه رایگان ${game.name}`, `ثبت نام رایگان ${game.englishName}`],
      dataFilter: { source: "tournaments", freeOnly: true },
      primaryCta: { label: "دیدن همه مسابقات", href: activeHref },
    }),
    page(game, {
      cluster: "tournaments",
      facet: game.id === "cod_mobile" ? "custom-room" : game.id === "fortnite" ? "battle-royale" : "one-vs-one",
      label: game.id === "cod_mobile" ? "کاستوم‌روم کالاف موبایل" : game.id === "fortnite" ? "مسابقات Battle Royale فورتنایت" : "مسابقات 1v1 کلش رویال",
      title: game.id === "cod_mobile"
        ? "کاستوم‌روم کالاف موبایل؛ Solo، Duo و Squad با جایزه"
        : game.id === "fortnite"
          ? "مسابقات Battle Royale فورتنایت؛ Solo، Duo و Squad"
          : "مسابقات 1v1 کلش رویال؛ دوئل آنلاین و نتیجه رسمی",
      description: game.id === "cod_mobile"
        ? "کاستوم‌روم‌های COD Mobile با مپ، ریجن، ظرفیت، جایزه Kill، Check-in و قوانین ضدچیت شفاف در COD Arena گیمنت."
        : game.id === "fortnite"
          ? "رویدادهای Battle Royale فورتنایت با مود تیمی، زمان لابی، ظرفیت، قوانین نتیجه و جوایز اعلام‌شده در گیمنت."
          : "دوئل‌های 1v1 کلش رویال با حریف‌یابی، قوانین پرداخت، پیوند دوستی، ثبت نتیجه و داوری قابل پیگیری در گیمنت.",
      intro: game.id === "cod_mobile"
        ? "کاستوم‌روم کالاف وقتی قابل اعتماد است که مپ، ریجن، مود تیمی، زاویه دید، ظرفیت و اقتصاد جایزه قبل از پرداخت روشن باشد. این صفحه روم‌های منتشرشده COD Arena را از داده واقعی جدا می‌کند و جزئیات حساس ورود را عمومی نمایش نمی‌دهد."
        : game.id === "fortnite"
          ? "در مسابقه Battle Royale فقط نام رویداد کافی نیست؛ بازیکن باید قبل از ورود بداند رقابت Solo، Duo یا Squad است، لابی چه زمانی باز می‌شود و نتیجه نهایی با چه مدرکی بررسی خواهد شد. این صفحه رویدادهای مرتبط را در یک مسیر قابل خزش جمع می‌کند."
          : "دوئل 1v1 کلش رویال یک مسیر کوتاه اما حساس دارد: پرداخت معتبر، پیدا شدن حریف هم‌سطح، ارسال پیوند دوستی صحیح و ثبت نتیجه‌ای که هر دو طرف بتوانند آن را تأیید کنند. این صفحه فقط رقابت‌های رسمی همین جریان را نمایش می‌دهد.",
      sections: game.id === "cod_mobile" ? [
        { heading: "اقتصاد و جایزه کاستوم‌روم", body: "ورودیه، کارمزد خدمات، بودجه جایزه، جایزه هر Kill و پاداش جایگاه باید جدا از هم نمایش داده شوند. در روم‌های مقیاس‌پذیر، مبلغ نهایی با تعداد ثبت‌نام‌شده محاسبه می‌شود و سقف ظرفیت نیز کنار آن دیده می‌شود." },
        { heading: "Check-in و محافظت از Room Code", body: "کد و پسورد روم عمومی نیست. بازیکن بعد از ثبت‌نام معتبر و Check-in، فقط در بازه اعلام‌شده اطلاعات ورود را می‌بیند. این طراحی احتمال لو رفتن کد و ورود بازیکن پرداخت‌نشده را کاهش می‌دهد." },
        { heading: "مدرک ضدچیت و تسویه", body: "رکورد بازی، Scoreboard و بررسی لابی برای تطبیق نام‌های مجاز استفاده می‌شود. Kill، Placement و مبلغ تسویه باید پس از تأیید اپراتور در نتیجه نهایی ثبت شوند." },
      ] : game.id === "fortnite" ? [
        { heading: "مود و ترکیب تیم را قبل از ثبت‌نام بخوان", body: "قوانین Solo با Duo و Squad یکسان نیست. مسئولیت ثبت نتیجه، جایگزینی هم‌تیمی و نحوه محاسبه Placement باید در صفحه رویداد مشخص باشد تا در پایان اختلاف ایجاد نشود." },
        { heading: "آمادگی فنی لابی فورتنایت", body: "نسخه بازی، Region، زمان لابی و محدودیت‌های آیتم یا مپ را قبل از شروع کنترل کن. تغییر تنظیمات در لحظه آخر نباید جایگزین اطلاع‌رسانی شفاف در صفحه رسمی رویداد شود." },
        { heading: "نتیجه قابل بازبینی", body: "اسکرین‌شات نهایی، شناسه بازیکن و زمان مسابقه باید قابل تطبیق باشند. نتیجه تأییدشده در آرشیو باقی می‌ماند تا بازیکن و برگزارکننده سابقه مشترک داشته باشند." },
      ] : [
        { heading: "حریف‌یابی و شروع دوئل", body: "هر ورودی باید به یک Challenge مشخص متصل شود. پس از پذیرش قوانین، حریف پیدا می‌شود و پیوند دوستی یا QR فقط برای همان رقابت استفاده خواهد شد؛ این روند جلوی جایگزینی حریف در میانه مسابقه را می‌گیرد." },
        { heading: "قوانین Deck و Game Mode", body: "Normal یا Draft بودن بازی، محدودیت کارت و تعداد راندها باید قبل از دوئل مشخص باشد. نتیجه بدون دانستن مود و نسخه توافق، زمینه اختلاف غیرضروری ایجاد می‌کند." },
        { heading: "تسویه بعد از نتیجه نهایی", body: "ادعای هر دو بازیکن مستقل ثبت می‌شود. در صورت هم‌خوانی، نتیجه نهایی است و در اختلاف، مدرک برای داوری می‌رود. مبلغ جایزه فقط بعد از نتیجه معتبر آزاد می‌شود." },
      ],
      checklist: game.id === "cod_mobile"
        ? ["ریجن Global یا Garena", "Solo/Duo/Squad و FPP/TPP", "زمان Check-in", "جایزه Kill و Placement", "الزام رکورد بازی"]
        : game.id === "fortnite"
          ? ["Battle Royale یا Creative", "Solo/Duo/Squad", "Region و زمان لابی", "قوانین آیتم و مپ", "مدرک Placement نهایی"]
          : ["Normal یا Draft", "قوانین Deck", "پیوند دوستی معتبر", "تعداد راند", "ثبت نتیجه دوطرفه"],
      faqs: [
        { question: `اطلاعات ورود ${game.name} چه زمانی نمایش داده می‌شود؟`, answer: `فقط بعد از احراز شرایط همان مسابقه و در زمان اعلام‌شده. ${game.safetyNote}` },
        { question: "اگر نتیجه دو طرف متفاوت باشد چه می‌شود؟", answer: "نتیجه به‌صورت خودکار نهایی نمی‌شود و همراه با مدرک‌های ثبت‌شده وارد مسیر داوری خواهد شد." },
        { question: "آیا صفحه مسابقه بعد از پایان حذف می‌شود؟", answer: "رویداد دارای نتیجه معتبر به آرشیو تبدیل می‌شود تا برنده، امتیاز و سابقه رقابت قابل مشاهده بماند." },
      ],
      keywords: game.id === "cod_mobile"
        ? ["کاستوم روم کالاف", "COD Mobile custom room", "روم کالاف با جایزه"]
        : game.id === "fortnite"
          ? ["مسابقات بتل رویال فورتنایت", "Fortnite Battle Royale tournament", "تورنومنت فورتنایت Solo"]
          : ["مسابقه 1v1 کلش رویال", "Clash Royale 1v1", "دوئل کلش رویال"],
      dataFilter: {
        source: "tournaments",
        modeTerms: game.id === "cod_mobile" ? ["custom", "room", "solo", "duo", "squad", "battle"] : game.id === "fortnite" ? ["battle", "royale", "solo", "duo", "squad"] : ["1v1", "one", "duel", "دوئل"],
      },
      primaryCta: { label: "ورود به رقابت‌ها", href: activeHref },
    }),
  ];
}

function resultPage(game: GameProfile): ProgrammaticSeoPage {
  const resultsHref = game.id === "cod_mobile"
    ? "/cod-arena?status=completed"
    : `/tournaments?game=${game.id}&status=completed`;

  return page(game, {
    cluster: "tournaments",
    facet: "results",
    label: `نتایج مسابقات ${game.name}`,
    title: `نتایج تورنومنت‌های ${game.name}؛ برندگان و آرشیو مسابقات`,
    description: `نتایج مسابقات پایان‌یافته ${game.name} در گیمنت؛ مشاهده برندگان، امتیازها، جایگاه نهایی، جزئیات داوری و لینک آرشیو هر تورنومنت.`,
    intro: `این صفحه آرشیو نتیجه‌های واقعی ${game.name} را از رویدادهای پایان‌یافته گیمنت جمع می‌کند. هر کارت به صفحه همان مسابقه متصل است تا نام رویداد، وضعیت نهایی، زمان، قوانین و داده‌هایی که برای اعلام برنده استفاده شده‌اند قابل بررسی باشند؛ اگر نتیجه واجد شرایطی ثبت نشده باشد، جدول یا قهرمان ساختگی نمایش داده نمی‌شود.`,
    sections: [
      {
        heading: `نتیجه معتبر مسابقه ${game.name} چه اجزایی دارد؟`,
        body: `نتیجه فقط یک نام در فهرست برندگان نیست. شناسه مسابقه، بازیکن یا تیم ثبت‌شده، امتیاز یا Placement، وضعیت داوری و زمان نهایی‌شدن باید با رکورد همان رویداد قابل تطبیق باشد. ${game.competitionFacts} نیز کمک می‌کند نتیجه را در زمینه مود و قانون درست بخوانی.`,
      },
      {
        heading: "تفاوت نتیجه موقت، اعتراض و نتیجه نهایی",
        body: "گزارش اولیه بازیکن می‌تواند تا زمان تطبیق مدرک یا پایان مهلت اعتراض موقت باشد. فقط رکوردی که جریان داوری آن تمام شده و وضعیت رویداد یا روم به پایان‌یافته تغییر کرده است باید به‌عنوان نتیجه قطعی در آرشیو عمومی دیده شود؛ اختلاف حل‌نشده نباید با برچسب قهرمان منتشر شود.",
      },
      {
        heading: "چطور از آرشیو برای بررسی سابقه استفاده کنی؟",
        body: `از صفحه نتیجه به پروفایل عمومی بازیکن، رتبه‌بندی و جزئیات رویداد برو و چند مسابقه را کنار هم مقایسه کن. یک برد به‌تنهایی معیار کامل مهارت نیست؛ تعداد مسابقات، باخت‌ها، Rating و کیفیت حریفان نیز مهم‌اند. ${game.safetyNote} هیچ اطلاعات خصوصی لابی در آرشیو عمومی قرار نمی‌گیرد.`,
      },
    ],
    checklist: ["وضعیت پایان‌یافته رویداد", "نام و شناسه قابل تطبیق", "امتیاز یا جایگاه نهایی", "پایان مهلت اعتراض", "لینک به صفحه رسمی مسابقه"],
    faqs: [
      { question: `نتایج مسابقات ${game.name} از کجا می‌آیند؟`, answer: "فهرست از رکوردهای پایان‌یافته دیتابیس اصلی گیمنت خوانده می‌شود و هر نتیجه به صفحه رسمی همان تورنومنت یا روم متصل است؛ داده دستی برای پرکردن آرشیو اضافه نمی‌شود." },
      { question: "چرا نتیجه یک مسابقه هنوز در این صفحه نیست؟", answer: "ممکن است مسابقه هنوز در جریان باشد، مدرک‌ها در حال بررسی باشند یا مهلت اعتراض تمام نشده باشد. فقط نتیجه‌ای که وضعیت عمومی و نهایی مناسب دارد وارد این آرشیو می‌شود." },
      { question: "آیا کد، پسورد یا لینک خصوصی لابی در نتیجه دیده می‌شود؟", answer: `خیر. آرشیو فقط داده عمومی مسابقه و نتیجه را نمایش می‌دهد. ${game.safetyNote}` },
    ],
    keywords: [`نتایج مسابقات ${game.name}`, `برندگان تورنومنت ${game.name}`, `آرشیو مسابقات ${game.englishName}`, `نتیجه تورنومنت ${game.name}`],
    dataFilter: { source: "tournaments", completedOnly: true },
    primaryCta: { label: "مشاهده آرشیو نتایج", href: resultsHref },
  });
}

function storePages(game: GameProfile): ProgrammaticSeoPage[] {
  return [
    page(game, {
      cluster: "store",
      facet: "accounts",
      label: `خرید اکانت ${game.name}`,
      title: `خرید و فروش اکانت ${game.name} با پرداخت امانی`,
      description: `آگهی‌های فعال اکانت ${game.name} در فروشگاه گیمنت با مشخصات واقعی، قیمت، تصاویر، وضعیت فروشنده و پرداخت امانی.`,
      intro: `صفحه خرید اکانت ${game.name} باید بیشتر از یک فهرست قیمت باشد. اینجا فقط آگهی فعال از دیتابیس فروشگاه نمایش داده می‌شود و هر محصول صفحه مستقل با مشخصات، تصاویر، قیمت و وضعیت موجودی دارد. اطلاعات محرمانه تحویل هیچ‌وقت در صفحه عمومی یا متادیتای جست‌وجو قرار نمی‌گیرد.`,
      sections: [
        { heading: "قبل از خرید چه چیزهایی را مقایسه کنی؟", body: `ارزش اکانت به یک عدد خلاصه نمی‌شود. ${game.identityCheck}، سطح پیشرفت، آیتم‌های قابل اثبات، روش ورود، امکان تغییر اطلاعات و سابقه فروشنده را کنار قیمت بررسی کن. تصویر مبهم یا توضیح کلی نباید جای مشخصات قابل راستی‌آزمایی را بگیرد.` },
        { heading: "پرداخت امانی چگونه ریسک را کم می‌کند؟", body: "مبلغ پس از ثبت سفارش مستقیماً برای فروشنده آزاد نمی‌شود؛ ابتدا در وضعیت امانی نگه داشته می‌شود. فروشنده کالا را طبق اطلاعات محرمانه سفارش تحویل می‌دهد و خریدار پس از بررسی، دریافت را تأیید می‌کند یا در مهلت تعیین‌شده اعتراض ثبت می‌کند." },
        { heading: "آگهی فعال، ناموجود و آرشیوشده", body: "فقط آگهی Active و قابل خرید باید در نتایج و Sitemap قرار بگیرد. محصول فروخته‌شده یا متوقف‌شده نباید با دکمه خرید جعلی باقی بماند. در صورت حذف دائمی، صفحه وضعیت درست 404 یا 410 می‌گیرد تا موتور جست‌وجو موجودی قدیمی را به کاربر پیشنهاد ندهد." },
      ],
      checklist: ["تصاویر واقعی و کافی", "روش ورود و امکان تغییر اطلاعات", "وضعیت احراز فروشنده", "موجودی و قیمت نهایی", "مدت گارانتی و مهلت اعتراض"],
      faqs: [
        { question: `چطور آگهی معتبر اکانت ${game.name} را تشخیص بدهم؟`, answer: "مشخصات قابل سنجش، چند تصویر واقعی، توضیح روش تحویل، قیمت روشن و سابقه فروشنده را بررسی کن. اطلاعات ورود فقط بعد از سفارش معتبر تحویل می‌شود." },
        { question: "آیا پول بلافاصله به فروشنده می‌رسد؟", answer: "خیر. مبلغ در پرداخت امانی نگه داشته می‌شود و پس از تأیید تحویل یا تصمیم نهایی داوری آزاد خواهد شد." },
        { question: "چرا بعضی آگهی‌ها در گوگل باقی نمی‌مانند؟", answer: "آگهی غیرفعال، فروخته‌شده، تکراری یا فاقد اطلاعات کافی از Sitemap خارج و در صورت نیاز noindex می‌شود تا نتایج قدیمی به کاربر نمایش داده نشود." },
      ],
      keywords: [`خرید اکانت ${game.name}`, `فروش اکانت ${game.name}`, `${game.englishName} account`, "خرید امن اکانت بازی"],
      dataFilter: { source: "store", kind: "account" },
      primaryCta: { label: "مشاهده آگهی‌های فعال", href: `/store?game=${game.id}&kind=account` },
    }),
    page(game, {
      cluster: "store",
      facet: game.currencySlug,
      label: `خرید ${game.currencyName}`,
      title: `خرید ${game.currencyName}؛ قیمت و بسته‌های موجود`,
      description: `بسته‌ها و آگهی‌های فعال ${game.currencyName} در گیمنت با مقدار، قیمت نهایی، موجودی، فروشنده و فرآیند پرداخت امن.`,
      intro: `برای مقایسه ${game.currencyName}، قیمت بدون دانستن مقدار بسته فایده‌ای ندارد. این صفحه محصولات فعال را بر اساس نوع ارز داخل بازی فیلتر می‌کند و مقدار، قیمت نهایی، موجودی و منبع عرضه را کنار هم قرار می‌دهد. اگر بسته واقعی موجود نباشد، سیستم محصول فرضی برای پرکردن صفحه تولید نمی‌کند.`,
      sections: [
        { heading: `مقایسه قیمت ${game.currencyName}`, body: "قیمت هر بسته را همراه با مقدار دقیق ارز، هزینه نهایی و موجودی ببین. بسته ارزان‌تر همیشه انتخاب بهتر نیست؛ زمان تحویل، رسمی یا کاربرمحور بودن عرضه و سابقه سفارش‌های تکمیل‌شده نیز در تصمیم خرید اثر دارد." },
        { heading: "تطبیق حساب مقصد قبل از پرداخت", body: `شناسه مقصد باید دقیقاً با حسابی که قرار است شارژ شود تطبیق داشته باشد. برای ${game.name}، ${game.identityCheck} را دوباره بررسی کن. اشتباه در شناسه یا Region ممکن است تحویل را ناممکن کند و نباید با حدس اصلاح شود.` },
        { heading: "موجودی و قیمت به‌روز", body: "صفحه محصول از رکورد فعال فروشگاه ساخته می‌شود، نه از متن ثابت تبلیغاتی. وقتی موجودی صفر یا آگهی متوقف شود، آن محصول از فهرست خرید و Sitemap خارج می‌شود. تاریخ تغییر رکورد نیز برای به‌روزرسانی Sitemap استفاده خواهد شد." },
      ],
      checklist: ["مقدار دقیق بسته", "قیمت نهایی به تومان", "شناسه صحیح مقصد", "موجودی واقعی", "زمان و روش تحویل"],
      faqs: [
        { question: `قیمت ${game.currencyName} چگونه مقایسه می‌شود؟`, answer: "مقدار هر بسته را بر قیمت نهایی تقسیم کن و در کنار آن زمان تحویل، منبع عرضه و سابقه فروشنده را در نظر بگیر." },
        { question: "اگر محصولی موجود نباشد چه می‌شود؟", answer: "محصول ناموجود قابل خرید نیست و URL آن از فهرست صفحات فعال خارج می‌شود؛ سیستم برای هدف‌گرفتن کلمه کلیدی، موجودی جعلی ایجاد نمی‌کند." },
        { question: "آیا اطلاعات محرمانه حساب در صفحه ذخیره می‌شود؟", answer: "خیر. صفحه عمومی فقط اطلاعات لازم برای انتخاب محصول را نشان می‌دهد و داده تحویل در جریان محافظت‌شده سفارش ردوبدل می‌شود." },
      ],
      keywords: [`خرید ${game.currencyName}`, `قیمت ${game.currencyName}`, `${game.currencyName} ارزان`, `فروش ${game.currencyName}`],
      dataFilter: { source: "store", kind: "currency", currencyKind: game.currencyKind },
      primaryCta: { label: `دیدن بسته‌های ${game.currencyName}`, href: `/store?game=${game.id}&currencyKind=${game.currencyKind}` },
    }),
  ];
}

function guidePages(game: GameProfile): ProgrammaticSeoPage[] {
  return [
    page(game, {
      cluster: "guides",
      facet: "join-tournaments",
      label: `راهنمای شرکت در مسابقات ${game.name}`,
      title: `آموزش ثبت‌نام در تورنومنت ${game.name}؛ از پروفایل تا نتیجه`,
      description: `راهنمای مرحله‌به‌مرحله شرکت در تورنومنت ${game.name}: تکمیل پروفایل، انتخاب مسابقه، پرداخت، Check-in، ورود به لابی و ثبت نتیجه.`,
      intro: `این راهنما مسیر کامل شرکت در مسابقه ${game.name} را توضیح می‌دهد؛ از زمانی که هنوز پروفایل بازی را تکمیل نکرده‌ای تا لحظه‌ای که نتیجه نهایی در سابقه‌ات ثبت می‌شود. مراحل بر اساس جریان واقعی گیمنت نوشته شده‌اند و هرجا رویداد فعال وجود داشته باشد، لینک آن مستقیماً در همین صفحه نمایش داده می‌شود.`,
      sections: [
        { heading: "۱. پروفایل بازی را درست تکمیل کن", body: `پیش از ثبت‌نام، ${game.identityCheck} را وارد و در مسابقات پولی مراحل لازم برای تأیید هویت بازی را کامل کن. نام نمایشی گیمنت جای شناسه داخل بازی را نمی‌گیرد؛ برگزارکننده باید بتواند بازیکن حاضر در لابی را با ثبت‌نام تطبیق دهد.` },
        { heading: "۲. رویداد، ورودیه و قوانین را بخوان", body: `در صفحه مسابقه ${game.competitionFacts} نمایش داده می‌شود. ظرفیت، جایزه، سیاست لغو و No-show را قبل از پرداخت بررسی کن. اگر زمان حضور مناسب نیست، ثبت‌نام نکن تا جای بازیکن دیگری اشغال نشود.` },
        { heading: "۳. Check-in، بازی و ثبت نتیجه", body: `در بازه اعلام‌شده Check-in کن و فقط از اطلاعات ورود همان صفحه استفاده کن. ${game.safetyNote} پس از مسابقه، مدرک نتیجه را از مسیر تعیین‌شده ارسال کن و تا نهایی‌شدن داوری نگه دار.` },
      ],
      checklist: ["ساخت حساب و تأیید ایمیل", `ثبت ${game.identityCheck}`, "انتخاب مسابقه متناسب", "پذیرش قوانین و پرداخت در صورت نیاز", "Check-in و ثبت مدرک نتیجه"],
      faqs: [
        { question: `برای مسابقه ${game.name} چه پروفایلی لازم است؟`, answer: `پروفایل گیمنت باید به اطلاعات صحیح بازی شامل ${game.identityCheck} متصل باشد. شرایط دقیق هر رویداد ممکن است متفاوت باشد.` },
        { question: "اگر Check-in نکنم چه می‌شود؟", answer: "بسته به قوانین رویداد ممکن است جایگاه آزاد شود و در مسابقه پولی، سیاست No-show روی بازگشت وجه اثر بگذارد؛ متن همان مسابقه ملاک است." },
        { question: "نتیجه را کجا ثبت کنم؟", answer: "داخل صفحه مسابقه یا جریان رسمی ربات که برای همان Match معرفی شده است. نتیجه خارج از مسیر رسمی قابل تطبیق و داوری مطمئن نیست." },
      ],
      keywords: [`آموزش تورنومنت ${game.name}`, `ثبت نام مسابقه ${game.name}`, `چگونه در مسابقه ${game.englishName} شرکت کنیم`],
      dataFilter: { source: "latest-tournaments" },
      primaryCta: { label: "شروع از فهرست مسابقات", href: game.id === "cod_mobile" ? "/cod-arena" : `/tournaments?game=${game.id}` },
    }),
    page(game, {
      cluster: "guides",
      facet: game.specialGuideSlug,
      label: game.specialGuideLabel,
      title: `${game.specialGuideLabel}؛ چک‌لیست قبل از شروع`,
      description: `${game.specialGuideLabel} با چک‌لیست پروفایل، تنظیمات، زمان‌بندی، امنیت ورود، مدرک نتیجه و پیگیری داوری در گیمنت.`,
      intro: game.id === "cod_mobile"
        ? "بیشترین خطای کاستوم‌روم قبل از شروع بازی اتفاق می‌افتد: بازیکن ریجن اشتباه دارد، Check-in را از دست می‌دهد یا کد روم را زود برای دیگری می‌فرستد. این راهنما همان نقاط شکست را به یک چک‌لیست عملی تبدیل می‌کند."
        : game.id === "fortnite"
          ? "آمادگی مسابقه فورتنایت فقط گرم‌کردن Aim نیست. Region، مود تیمی، نسخه بازی، قوانین لابی، روش ثبت Placement و هماهنگی هم‌تیمی باید پیش از شروع قطعی شوند تا نتیجه فنی با اختلاف اجرایی مخلوط نشود."
          : "در دوئل 1v1 کلش رویال، تأخیر در ارسال پیوند دوستی، انتخاب مود متفاوت یا ثبت نتیجه ناقص می‌تواند یک بازی کوتاه را به اختلاف طولانی تبدیل کند. این چک‌لیست جریان دوئل را قبل، حین و بعد از Match روشن می‌کند.",
      sections: game.id === "cod_mobile" ? [
        { heading: "پیش از بازشدن Check-in", body: "UID و نام داخل بازی را با پروفایل تطبیق بده، ریجن Global/Garena را کنترل کن و فضای کافی برای رکورد بازی داشته باش. مپ، Team Mode، Perspective و آیتم‌های ممنوع را از صفحه روم بخوان." },
        { heading: "از Check-in تا ورود به Lobby", body: "در بازه رسمی حضور را تأیید کن. Room Code و Password را برای فرد دیگری نفرست و فقط با همان UID تأییدشده وارد شو. اپراتور می‌تواند تصویر Lobby را با فهرست پرداخت‌شده‌ها تطبیق دهد." },
        { heading: "بعد از پایان بازی", body: "Scoreboard و رکورد لازم را نگه دار. Kill و Placement باید با نتیجه ثبت‌شده هم‌خوان باشد. اگر اختلافی وجود دارد، گزارش را با نام دقیق بازیکن، زمان و مدرک قابل بازبینی ارسال کن." },
      ] : game.id === "fortnite" ? [
        { heading: "تنظیمات رقابتی و Region", body: "Region مسابقه را از قبل انتخاب کن، آپدیت بازی و پایداری اتصال را بررسی کن و تنظیمات گرافیکی را طوری بچین که Frame Time پایدار باشد. تغییر بزرگ Sensitivity درست قبل از مسابقه معمولاً ریسک بیشتری از فایده دارد." },
        { heading: "هماهنگی Solo، Duo یا Squad", body: "در رقابت تیمی، لیدر لابی، نام دقیق اعضا و مسئول ثبت مدرک را قبل از شروع مشخص کنید. اگر جایگزینی بازیکن مجاز نیست، ورود عضو ثبت‌نشده می‌تواند نتیجه تیم را باطل کند." },
        { heading: "ثبت Placement و مدرک", body: "صفحه نتیجه باید نام/شناسه، Placement، زمان و در صورت نیاز Elimination را نشان دهد. عکس بریده یا بدون اطلاعات تطبیق، کیفیت داوری را پایین می‌آورد." },
      ] : [
        { heading: "Deck و مود توافق‌شده", body: "قبل از شروع مشخص کنید بازی Normal، Draft یا Best-of چند است. Deck را مطابق قانون انتخاب کن و از تغییر شرط بعد از Matchmaking خودداری کن." },
        { heading: "ارسال پیوند دوستی امن", body: "پیوند یا QR را فقط در جریان رسمی Challenge ارسال کن. حریف باید همان کاربری باشد که سیستم معرفی کرده و شناسه Match قبل از شروع قابل مشاهده باشد." },
        { heading: "ادعای نتیجه و داوری", body: "هر بازیکن نتیجه خودش را ثبت می‌کند. ادعاهای یکسان می‌توانند سریع نهایی شوند؛ اختلاف باید با اسکرین‌شات نتیجه، Player Tag و توضیح کوتاه برای داور ارسال شود." },
      ],
      checklist: game.id === "cod_mobile"
        ? ["UID و ریجن صحیح", "فضای رکورد", "Check-in به‌موقع", "عدم انتشار Room Code", "تصویر Scoreboard"]
        : game.id === "fortnite"
          ? ["آپدیت و Region", "مود و ترکیب تیم", "قوانین آیتم", "مسئول ثبت مدرک", "تصویر Placement"]
          : ["Player Tag صحیح", "مود و تعداد راند", "پیوند دوستی رسمی", "شناسه حریف", "اسکرین‌شات نتیجه"],
      faqs: [
        { question: "مهم‌ترین کار قبل از شروع چیست؟", answer: `تطبیق هویت بازی (${game.identityCheck}) با ثبت‌نام و خواندن تنظیمات اختصاصی همان رویداد.` },
        { question: "مدرک نتیجه باید چه چیزی نشان دهد؟", answer: "نام یا شناسه قابل تطبیق بازیکن، نتیجه نهایی و اطلاعات کافی برای تشخیص همان Match؛ جزئیات دقیق در قوانین رویداد نوشته می‌شود." },
        { question: "اگر مشکل فنی رخ دهد چه کنم؟", answer: "قبل از ترک جریان رسمی، زمان و نوع خطا را ثبت و از صفحه مسابقه یا پشتیبانی گزارش کن. ادامه بازی با شرایط جدید بدون تأیید برگزارکننده می‌تواند داوری را دشوار کند." },
      ],
      keywords: [game.specialGuideLabel, `راهنمای مسابقه ${game.name}`, `تنظیمات رقابتی ${game.name}`],
      dataFilter: { source: "latest-tournaments" },
      primaryCta: { label: "مشاهده رویدادهای مرتبط", href: game.id === "cod_mobile" ? "/cod-arena" : `/tournaments?game=${game.id}` },
    }),
  ];
}

function leaderboardPages(game: GameProfile): ProgrammaticSeoPage[] {
  return ([
    {
      facet: "rating",
      label: `رتبه‌بندی ${game.name} بر اساس امتیاز`,
      title: `رتبه‌بندی بازیکنان ${game.name} بر اساس Rating`,
      description: `جدول بازیکنان ${game.name} در گیمنت بر اساس Rating، همراه با برد، باخت، نرخ برد و لینک پروفایل عمومی هر بازیکن.`,
      metric: "rating" as const,
      metricExplanation: "Rating برای مقایسه قدرت رقابتی طراحی شده و باید با نتیجه Matchهای معتبر تغییر کند؛ صرف ساخت حساب یا واردکردن نام بازی امتیاز واقعی ایجاد نمی‌کند.",
    },
    {
      facet: "wins",
      label: `بازیکنان ${game.name} با بیشترین برد`,
      title: `بیشترین برد در ${game.name}؛ جدول بازیکنان برتر`,
      description: `بازیکنان ${game.name} با بیشترین برد ثبت‌شده در گیمنت، همراه با تعداد باخت، نرخ برد و سابقه مسابقات قابل مشاهده.`,
      metric: "wins" as const,
      metricExplanation: "تعداد برد یک معیار حجمی است؛ بازیکنی که بیشتر مسابقه داده ممکن است برد بیشتری داشته باشد. برای تحلیل منصفانه، تعداد باخت و نرخ برد را نیز کنار آن ببین.",
    },
  ]).map((seed) =>
    page(game, {
      cluster: "leaderboards",
      facet: seed.facet,
      label: seed.label,
      title: seed.title,
      description: seed.description,
      intro: `این جدول از پروفایل‌های متصل به ${game.name} ساخته می‌شود و به‌جای نوشتن دستی نام‌ها، داده رتبه‌بندی را از رکوردهای واقعی بازیکنان می‌خواند. هر ردیف به پروفایل عمومی همان بازیکن متصل است تا بتوانی آمار کلی و مسابقات اخیر را بررسی کنی.`,
      sections: [
        { heading: `معیار ${seed.metric === "rating" ? "Rating" : "تعداد برد"} چه چیزی را نشان می‌دهد؟`, body: seed.metricExplanation },
        { heading: "چرا فقط پروفایل متصل نمایش داده می‌شود؟", body: `برای ورود به این جدول، حساب باید اطلاعات ${game.identityCheck} داشته باشد. این شرط مانع آن می‌شود که پروفایل‌های کاملاً خالی و بدون ارتباط با بازی فقط برای ساخت صفحه جدید وارد رتبه‌بندی شوند.` },
        { heading: "جدول به‌روز و قابل پیگیری", body: "رتبه‌ها هنگام تغییر نتایج بازسازی می‌شوند. صفحه پروفایل بازیکنی که هیچ مسابقه، برد، باخت، تأیید یا اتصال معتبر ندارد می‌تواند noindex شود تا موتور جست‌وجو با هزاران پروفایل خالی مواجه نشود." },
      ],
      checklist: ["اتصال پروفایل بازی", "نتیجه تأییدشده", "نمایش برد و باخت", "محاسبه نرخ برد واقعی", "لینک به پروفایل عمومی"],
      faqs: [
        { question: "رتبه‌ها هر چند وقت به‌روزرسانی می‌شوند؟", answer: "داده صفحه از رکوردهای جاری بازیکنان خوانده می‌شود و با ثبت نتایج جدید تغییر می‌کند. Sitemap نیز زمان تغییر صفحات واجد شرایط را منعکس می‌کند." },
        { question: "چرا یک بازیکن در این جدول نیست؟", answer: `ممکن است پروفایل او به ${game.name} متصل نباشد، داده عمومی کافی نداشته باشد یا هنوز نتیجه‌ای برای معیار این جدول ثبت نکرده باشد.` },
        { question: "Rating و تعداد برد یکسان هستند؟", answer: "خیر. Rating کیفیت نسبی نتیجه‌ها را دنبال می‌کند، ولی تعداد برد صرفاً مجموع پیروزی‌هاست؛ بهتر است هر دو همراه نرخ برد بررسی شوند." },
      ],
      keywords: seed.metric === "rating"
        ? [`رتبه بندی ${game.name}`, `لیدربورد ${game.name}`, `بهترین بازیکنان ${game.englishName}`]
        : [`بیشترین برد ${game.name}`, `بازیکنان برتر ${game.name}`, `${game.englishName} wins leaderboard`],
      dataFilter: { source: "leaderboard", metric: seed.metric },
      primaryCta: { label: "مشاهده لیدربورد اصلی", href: `/leaderboard` },
    })
  );
}

export const PROGRAMMATIC_SEO_PAGES: ProgrammaticSeoPage[] = GAMES.flatMap((game) => [
  ...tournamentPages(game),
  resultPage(game),
  ...storePages(game),
  ...guidePages(game),
  ...leaderboardPages(game),
]);

export function programmaticPath(pageDefinition: Pick<ProgrammaticSeoPage, "gameSlug" | "cluster" | "facet">) {
  return `/games/${pageDefinition.gameSlug}/${pageDefinition.cluster}/${pageDefinition.facet}`;
}

export function getProgrammaticSeoPage(gameSlug: string, cluster: string, facet: string) {
  return PROGRAMMATIC_SEO_PAGES.find(
    (candidate) => candidate.gameSlug === gameSlug && candidate.cluster === cluster && candidate.facet === facet
  );
}

export function getRelatedProgrammaticPages(current: ProgrammaticSeoPage, limit = 6) {
  return PROGRAMMATIC_SEO_PAGES.filter(
    (candidate) =>
      programmaticPath(candidate) !== programmaticPath(current) &&
      (candidate.gameSlug === current.gameSlug || candidate.cluster === current.cluster)
  )
    .sort((a, b) => {
      const aScore = Number(a.gameSlug === current.gameSlug) * 2 + Number(a.cluster === current.cluster);
      const bScore = Number(b.gameSlug === current.gameSlug) * 2 + Number(b.cluster === current.cluster);
      return bScore - aScore || programmaticPath(a).localeCompare(programmaticPath(b));
    })
    .slice(0, limit);
}

export function scoreProgrammaticPage(pageDefinition: ProgrammaticSeoPage) {
  const reasons: string[] = [];
  let score = 0;
  const visibleCopy = [
    pageDefinition.intro,
    ...pageDefinition.sections.map((section) => `${section.heading} ${section.body}`),
    ...pageDefinition.checklist,
    ...pageDefinition.faqs.flatMap((faq) => [faq.question, faq.answer]),
  ].join(" ");

  if (pageDefinition.title.length >= 24 && pageDefinition.title.length <= 85) score += 15;
  else reasons.push("title_length");
  if (pageDefinition.description.length >= 80 && pageDefinition.description.length <= 190) score += 15;
  else reasons.push("description_length");
  if (pageDefinition.intro.length >= 150) score += 15;
  else reasons.push("intro_too_short");
  if (pageDefinition.sections.length >= 3 && pageDefinition.sections.every((section) => section.body.length >= 110)) score += 25;
  else reasons.push("sections_too_thin");
  if (pageDefinition.checklist.length >= 4) score += 10;
  else reasons.push("checklist_too_short");
  if (pageDefinition.faqs.length >= 3 && pageDefinition.faqs.every((faq) => faq.answer.length >= 70)) score += 10;
  else reasons.push("faq_too_thin");
  if (visibleCopy.length >= 1_000) score += 10;
  else reasons.push("total_copy_too_short");

  return { score, indexable: score >= 80, reasons, visibleCharacters: visibleCopy.length };
}

export function programmaticCanonical(pageDefinition: ProgrammaticSeoPage) {
  return absoluteUrl(programmaticPath(pageDefinition));
}

export function programmaticStaticParams() {
  return PROGRAMMATIC_SEO_PAGES.map((pageDefinition) => ({
    slug: pageDefinition.gameSlug,
    cluster: pageDefinition.cluster,
    facet: pageDefinition.facet,
  }));
}
