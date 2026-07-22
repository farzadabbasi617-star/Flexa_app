export const CLASH_1V1_CONFIG = {
  name: "1V1 کلش رویال",
  categoryLabel: "clash_1v1_queue",
  game: "clash_royale" as const,
  format: "single_elimination" as const,
  status: "registration" as const,
  maxPlayers: 1000,
  entryFee: "50,000 تومان",
  entryFeeToman: 50_000,
  prizePool: "80,000 تومان",
  prize1st: "80,000 تومان",
  prizeToman: 80_000,
  gameMode: "1V1 Friendly Battle",
  mapName: "Arena",
  description:
    "رقابت 1V1 کلش رویال با حریف تصادفی یا دعوت خصوصی دوست، در حالت رایگان یا پولی و مودهای معمولی، انتخاب کارت، Triple Draft و Sudden Death. نتیجه و مود با Battle Log بررسی می‌شوند.",
  rules:
    "• فقط Player Tag تأییدشده خودتان مجاز است.\n• نوع حریف، رایگان/پولی بودن و مود بازی پیش از ورود مشخص می‌شود.\n• در بازی با دوست، تا توافق دو طرف روی مود هیچ مبلغی کسر نمی‌شود.\n• بعد از توافق، QR یا «اشتراک‌گذاری پیوند» رسمی کلش رویال را برای بات بفرستید.\n• در صف تصادفی فقط بازیکنان دارای نوع مالی و مود یکسان به هم معرفی می‌شوند.\n• هر دو بازیکن نتیجه را مستقل ثبت می‌کنند؛ Battle Log نتیجه و مود انجام‌شده را بررسی می‌کند.\n• مود اشتباه در رقابت پولی به داوری می‌رود و در رقابت رایگان نیاز به تکرار دارد.\n• جایزه هر 1V1 پولی: ۸۰,۰۰۰ تومان.",
  lobbyNotes:
    "این حالت نیاز به Room ID یا Password ندارد. بات QR یا پیوند دوستی دو حریف را برای یکدیگر ارسال می‌کند.",
} as const;

/** The 1V1 category is matchmaking-only, never a manually hosted room. */
export function normalizeClash1v1QueueSettings<T extends Record<string, unknown>>(input: T): T & Record<string, unknown> {
  if (String(input.categoryLabel || "") !== CLASH_1V1_CONFIG.categoryLabel) return input;
  return {
    ...input,
    name: CLASH_1V1_CONFIG.name,
    game: CLASH_1V1_CONFIG.game,
    format: CLASH_1V1_CONFIG.format,
    status: "registration",
    maxPlayers: CLASH_1V1_CONFIG.maxPlayers,
    serverSlots: 2,
    winnersCount: 1,
    entryFee: CLASH_1V1_CONFIG.entryFee,
    prizePool: CLASH_1V1_CONFIG.prizePool,
    prize1st: CLASH_1V1_CONFIG.prize1st,
    prize2nd: null,
    prize3rd: null,
    prize4to10: null,
    gameMode: CLASH_1V1_CONFIG.gameMode,
    mapName: CLASH_1V1_CONFIG.mapName,
    description: CLASH_1V1_CONFIG.description,
    rules: CLASH_1V1_CONFIG.rules,
    lobbyNotes: CLASH_1V1_CONFIG.lobbyNotes,
    roomId: null,
    roomPassword: null,
    roomVisibleAt: null,
  } as T & Record<string, unknown>;
}

export function isClash1v1QueueTournament(tournament?: {
  game?: string | null;
  name?: string | null;
  categoryLabel?: string | null;
}) {
  if (!tournament) return false;
  return tournament.game === CLASH_1V1_CONFIG.game
    && tournament.categoryLabel === CLASH_1V1_CONFIG.categoryLabel;
}

export const isClash1v1TournamentLike = isClash1v1QueueTournament;
