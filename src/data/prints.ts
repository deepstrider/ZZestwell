export const SHEET_URL =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261120_071134_02d2d6ba-ed91-4c3f-87c4-1354b61b5882.png&w=1744&q=85';

export const SHEET_W = 1744;
export const SHEET_H = 2336;

const COLS: readonly [number, number][] = [
  [0, 575],
  [585, 1158],
  [1168, 1743],
];

const ROWS: readonly [number, number][] = [
  [0, 769],
  [779, 1545],
  [1555, 2335],
];

const DESCRIPTION_SUFFIX =
  ', painted in flat gouache tones. Printed on archival paper with a soft matte finish.';

export interface PrintCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PrintItem {
  index: number;
  title: string;
  artist: string;
  year: number;
  price: number;
  description: string;
  crop: PrintCrop;
}

const RAW_PRINTS = [
  {
    title: 'Lemons on Gingham',
    artist: 'Tova Lindqvist',
    year: 2024,
    price: 60,
    descStart: 'A sunny tabletop of lemons, a striped jug and blue gingham',
  },
  {
    title: 'Oranges & Stripe',
    artist: 'Elise Marten',
    year: 2024,
    price: 60,
    descStart: 'A striped bowl heaped with oranges on a candy-stripe cloth',
  },
  {
    title: 'Pink Blooms',
    artist: 'Soren Vale',
    year: 2023,
    price: 55,
    descStart: 'Pink garden flowers in a cobalt striped jug against warm yellow',
  },
  {
    title: 'Citrus Jug',
    artist: 'Nora Feldt',
    year: 2024,
    price: 60,
    descStart: 'Leafy lemon branches in a striped jug on a sunlit table',
  },
  {
    title: 'Teacup & Lemon',
    artist: 'Ada Kerrow',
    year: 2023,
    price: 50,
    descStart: 'A blue-patterned teacup with a slice of lemon, all morning light',
  },
  {
    title: 'Blood Orange Bowl',
    artist: 'Pim Halden',
    year: 2024,
    price: 60,
    descStart: 'Halved blood oranges glowing in a white bowl on deep blue',
  },
  {
    title: 'Lemon Tree, Window',
    artist: 'Ines Morrow',
    year: 2022,
    price: 65,
    descStart: 'A potted lemon tree by an open window on a gingham table',
  },
  {
    title: 'Grapefruit Halves',
    artist: 'Juno Basset',
    year: 2024,
    price: 55,
    descStart: 'Pink grapefruit halves on a hand-painted checked plate',
  },
  {
    title: 'Daisies in Stripes',
    artist: 'Wren Calloway',
    year: 2023,
    price: 55,
    descStart: 'White daisies in a tall striped pitcher against blush pink',
  },
] as const;

export const PRINTS: readonly PrintItem[] = RAW_PRINTS.map((item, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const [colStart, colEnd] = COLS[col];
  const [rowStart, rowEnd] = ROWS[row];
  const x = colStart + 6;
  const y = rowStart + 6;
  const w = colEnd - colStart - 12;
  const h = rowEnd - rowStart - 12;

  return {
    index: i,
    title: item.title,
    artist: item.artist,
    year: item.year,
    price: item.price,
    description: item.descStart + DESCRIPTION_SUFFIX,
    crop: { x, y, w, h },
  };
});

export function getDomCropStyle(
  crop: PrintCrop,
  width: number,
  height: number,
): { backgroundImage: string; backgroundRepeat: string; backgroundSize: string; backgroundPosition: string } {
  if (width <= 0 || height <= 0) {
    return {
      backgroundImage: `url("${SHEET_URL}")`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: '100% 100%',
      backgroundPosition: '0 0',
    };
  }
  const sx = width / crop.w;
  const sy = height / crop.h;
  return {
    backgroundImage: `url("${SHEET_URL}")`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${(SHEET_W * sx).toFixed(3)}px ${(SHEET_H * sy).toFixed(3)}px`,
    backgroundPosition: `${(-crop.x * sx).toFixed(3)}px ${(-crop.y * sy).toFixed(3)}px`,
  };
}

export const PAPER_OPTIONS = ['Art Paper', 'Fine Art Paper', 'Recycled Paper'] as const;
export const SIZE_OPTIONS = [
  '11.7 × 16.5" (A3)',
  '16.5 × 23.4" (A2)',
  '23.4 × 33.1" (A1)',
  '33.1 × 46.8" (A0)',
] as const;
export const SIGNATURE_OPTIONS = ['Unsigned', 'Signed and Numbered'] as const;
export const FRAME_OPTIONS = ['Unframed', 'Classic Frame', 'Framed Canvas'] as const;

export type PaperOption = (typeof PAPER_OPTIONS)[number];
export type SizeOption = (typeof SIZE_OPTIONS)[number];
export type SignatureOption = (typeof SIGNATURE_OPTIONS)[number];
export type FrameOption = (typeof FRAME_OPTIONS)[number];

export const CURRENCIES = {
  USD: { symbol: '$', rate: 1 },
  EUR: { symbol: '€', rate: 0.92 },
  GBP: { symbol: '£', rate: 0.79 },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export function formatMoney(usdAmount: number, currency: CurrencyCode, spaced = false): string {
  const { symbol, rate } = CURRENCIES[currency];
  const converted = (usdAmount * rate).toFixed(2);
  return spaced ? `${symbol} ${converted}` : `${symbol}${converted}`;
}

export const ACCORDION_ITEMS = [
  {
    title: 'Paper & Sizes',
    body: 'Art Paper is a smooth 200 gsm matte stock. Fine Art Paper is a 310 gsm cotton rag with a soft texture. Recycled Paper is 100% post-consumer fibre.',
  },
  {
    title: 'Delivery Info',
    body: 'Prints are made to order and ship rolled in a tube within 3–5 working days. Framed pieces ship flat within 7–10 working days.',
  },
  {
    title: 'Returns Policy',
    body: 'Unframed prints can be returned within 30 days in their original tube. Signed editions are final sale.',
  },
] as const;
