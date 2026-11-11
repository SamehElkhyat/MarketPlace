/**
 * Demo catalogue. Categories only declare attributes; products only fill them in — the seed script
 * contains no category-specific logic, which is exactly the extensibility the architecture promises.
 */

export interface AttrSeed {
  key: string;
  ar: string;
  en: string;
  values: { value: string; ar?: string; en?: string; swatch?: string }[];
  filterable?: boolean;
  variantOption?: boolean;
}

export interface CategorySeed {
  slug: string;
  ar: string;
  en: string;
  attributes?: AttrSeed[];
  children?: CategorySeed[];
}

const colors = (...c: [string, string, string, string][]) => c.map(([value, ar, en, swatch]) => ({ value, ar, en, swatch }));
const sizes = (...s: string[]) => s.map((value) => ({ value }));

export const CATEGORIES: CategorySeed[] = [
  {
    slug: 'fashion', ar: 'موضة', en: 'Fashion',
    attributes: [
      { key: 'size', ar: 'المقاس', en: 'Size', values: sizes('S', 'M', 'L', 'XL'), filterable: true, variantOption: true },
      { key: 'color', ar: 'اللون', en: 'Color', values: colors(['black', 'أسود', 'Black', '#1F1A16'], ['sand', 'رملي', 'Sand', '#C9B79C'], ['olive', 'زيتي', 'Olive', '#6B6B47'], ['navy', 'كحلي', 'Navy', '#2B3A55']), filterable: true, variantOption: true },
      { key: 'material', ar: 'الخامة', en: 'Material', values: [{ value: 'cotton', ar: 'قطن', en: 'Cotton' }, { value: 'linen', ar: 'كتان', en: 'Linen' }, { value: 'wool', ar: 'صوف', en: 'Wool' }, { value: 'denim', ar: 'جينز', en: 'Denim' }], filterable: true },
    ],
    children: [
      { slug: 'men', ar: 'رجالي', en: 'Men', children: [
        { slug: 'men-tshirts', ar: 'تيشيرتات', en: 'T-shirts' },
        { slug: 'men-shirts', ar: 'قمصان', en: 'Shirts' },
        { slug: 'men-trousers', ar: 'بناطيل', en: 'Trousers' },
      ] },
      { slug: 'women', ar: 'نسائي', en: 'Women', children: [
        { slug: 'women-dresses', ar: 'فساتين', en: 'Dresses' },
        { slug: 'women-tops', ar: 'بلوزات', en: 'Tops' },
      ] },
    ],
  },
  {
    slug: 'electronics', ar: 'إلكترونيات', en: 'Electronics',
    attributes: [
      { key: 'storage', ar: 'المساحة', en: 'Storage', values: sizes('128GB', '256GB', '512GB', '1TB'), filterable: true, variantOption: true },
      { key: 'ram', ar: 'الرام', en: 'RAM', values: sizes('8GB', '16GB', '32GB'), filterable: true, variantOption: true },
      { key: 'color', ar: 'اللون', en: 'Color', values: colors(['graphite', 'جرافيت', 'Graphite', '#3A3A3C'], ['silver', 'فضي', 'Silver', '#C8CACC'], ['midnight', 'ليلي', 'Midnight', '#1E2230']), filterable: true, variantOption: true },
    ],
    children: [
      { slug: 'phones', ar: 'هواتف', en: 'Phones' },
      { slug: 'laptops', ar: 'لابتوب', en: 'Laptops' },
      { slug: 'audio', ar: 'صوتيات', en: 'Audio' },
    ],
  },
  {
    slug: 'home-kitchen', ar: 'بيت ومطبخ', en: 'Home & Kitchen',
    attributes: [
      { key: 'capacity', ar: 'السعة', en: 'Capacity', values: sizes('1L', '2L', '3L'), filterable: true, variantOption: true },
      { key: 'color', ar: 'اللون', en: 'Color', values: colors(['white', 'أبيض', 'White', '#F4F1EB'], ['walnut', 'جوزي', 'Walnut', '#5B3F2E'], ['stone', 'حجري', 'Stone', '#9A9185']), filterable: true, variantOption: true },
      { key: 'material', ar: 'الخامة', en: 'Material', values: [{ value: 'ceramic', ar: 'سيراميك', en: 'Ceramic' }, { value: 'steel', ar: 'ستانلس', en: 'Stainless steel' }, { value: 'wood', ar: 'خشب', en: 'Wood' }, { value: 'linen', ar: 'كتان', en: 'Linen' }], filterable: true },
    ],
    children: [
      { slug: 'cookware', ar: 'أدوات الطهي', en: 'Cookware' },
      { slug: 'decor', ar: 'ديكور', en: 'Decor' },
      { slug: 'bedding', ar: 'مفروشات', en: 'Bedding' },
    ],
  },
  {
    slug: 'beauty', ar: 'جمال وعناية', en: 'Beauty & Care',
    attributes: [
      { key: 'volume', ar: 'الحجم', en: 'Volume', values: sizes('30ml', '50ml', '100ml'), filterable: true, variantOption: true },
      { key: 'skin_type', ar: 'نوع البشرة', en: 'Skin type', values: [{ value: 'dry', ar: 'جافة', en: 'Dry' }, { value: 'oily', ar: 'دهنية', en: 'Oily' }, { value: 'combination', ar: 'مختلطة', en: 'Combination' }, { value: 'all', ar: 'كل الأنواع', en: 'All skin types' }], filterable: true },
    ],
    children: [
      { slug: 'skincare', ar: 'العناية بالبشرة', en: 'Skincare' },
      { slug: 'fragrance', ar: 'عطور', en: 'Fragrance' },
    ],
  },
  {
    slug: 'accessories', ar: 'إكسسوارات', en: 'Accessories',
    attributes: [
      { key: 'color', ar: 'اللون', en: 'Color', values: colors(['black', 'أسود', 'Black', '#1F1A16'], ['tan', 'بني فاتح', 'Tan', '#A67C52'], ['cognac', 'كونياك', 'Cognac', '#8A4B2A']), filterable: true, variantOption: true },
      { key: 'material', ar: 'الخامة', en: 'Material', values: [{ value: 'leather', ar: 'جلد', en: 'Leather' }, { value: 'canvas', ar: 'كانفاس', en: 'Canvas' }, { value: 'steel', ar: 'ستانلس', en: 'Steel' }], filterable: true },
    ],
    children: [
      { slug: 'bags', ar: 'حقائب', en: 'Bags' },
      { slug: 'watches', ar: 'ساعات', en: 'Watches' },
      { slug: 'wallets', ar: 'محافظ', en: 'Wallets' },
    ],
  },
];

export const BRANDS = [
  { name: 'Atelier Nile', slug: 'atelier-nile', ar: 'أتيليه النيل', en: 'Egyptian-made essentials in natural fabrics.' },
  { name: 'Maison Delta', slug: 'maison-delta', ar: 'ميزون دلتا', en: 'Considered homeware for everyday rituals.' },
  { name: 'Orbit', slug: 'orbit', ar: 'أوربت', en: 'Quiet, well-made consumer electronics.' },
  { name: 'Safra', slug: 'safra', ar: 'صفرة', en: 'Skincare and fragrance from simple ingredients.' },
  { name: 'Walnut & Co.', slug: 'walnut-co', ar: 'والنت', en: 'Leather goods and timepieces built to last.' },
];

export interface ProductSeed {
  en: string;
  ar: string;
  category: string;
  brand: string;
  /** Base price in EGP. */
  price: number;
  /** Adds this many EGP per step along the first option (e.g. bigger storage costs more). */
  step?: number;
  options: Record<string, string[]>;
  specs?: Record<string, string>;
  descEn: string;
  descAr: string;
  sale?: number; // compareAt multiplier, e.g. 1.25
  stock?: number;
  tags?: string[];
}

export const PRODUCTS: ProductSeed[] = [
  // ── Fashion ──────────────────────────────────────────────────────────────
  { en: 'Heavyweight Cotton Tee', ar: 'تيشيرت قطن ثقيل', category: 'men-tshirts', brand: 'atelier-nile', price: 450, options: { size: ['S', 'M', 'L', 'XL'], color: ['black', 'sand'] }, specs: { material: 'cotton' }, descEn: 'A 240 gsm tee in combed Egyptian cotton with a boxy, relaxed cut.', descAr: 'تيشيرت بوزن 240 جرام من القطن المصري المسرّح بقصّة مريحة.', stock: 12 },
  { en: 'Washed Linen Shirt', ar: 'قميص كتان مغسول', category: 'men-shirts', brand: 'atelier-nile', price: 950, options: { size: ['S', 'M', 'L'], color: ['sand', 'olive'] }, specs: { material: 'linen' }, descEn: 'Garment-washed linen for a lived-in drape from the first wear.', descAr: 'كتان مغسول يمنحك انسدالاً مريحاً من أول ارتداء.', sale: 1.25, stock: 8 },
  { en: 'Pleated Wool Trousers', ar: 'بنطلون صوف بكسرات', category: 'men-trousers', brand: 'atelier-nile', price: 1650, options: { size: ['S', 'M', 'L', 'XL'], color: ['navy', 'black'] }, specs: { material: 'wool' }, descEn: 'Tailored in a soft wool blend with a high rise and a tapered leg.', descAr: 'مفصّل من خليط صوف ناعم بخصر مرتفع وساق مستقيمة.', stock: 6 },
  { en: 'Selvedge Denim Jeans', ar: 'جينز سيلفدج', category: 'men-trousers', brand: 'atelier-nile', price: 1450, options: { size: ['M', 'L', 'XL'], color: ['navy'] }, specs: { material: 'denim' }, descEn: 'Rigid 13 oz selvedge denim that fades beautifully with wear.', descAr: 'جينز سيلفدج صلب بوزن 13 أونصة يتدرّج لونه بجمال مع الاستخدام.', stock: 5 },
  { en: 'Oversized Cotton Poplin Shirt', ar: 'قميص بوبلين قطن واسع', category: 'men-shirts', brand: 'atelier-nile', price: 880, options: { size: ['S', 'M', 'L'], color: ['black', 'sand'] }, specs: { material: 'cotton' }, descEn: 'Crisp poplin with a dropped shoulder, made for layering.', descAr: 'بوبلين متين بكتف منسدل ومناسب للطبقات.', stock: 9 },
  { en: 'Fluid Linen Midi Dress', ar: 'فستان كتان ميدي', category: 'women-dresses', brand: 'atelier-nile', price: 1350, options: { size: ['S', 'M', 'L'], color: ['sand', 'olive', 'black'] }, specs: { material: 'linen' }, descEn: 'A relaxed midi with side pockets and a softly gathered waist.', descAr: 'فستان ميدي مريح بجيوب جانبية وخصر مجمّع بنعومة.', sale: 1.3, stock: 7 },
  { en: 'Merino Rib Top', ar: 'بلوزة صوف ميرينو', category: 'women-tops', brand: 'atelier-nile', price: 790, options: { size: ['S', 'M', 'L'], color: ['black', 'navy'] }, specs: { material: 'wool' }, descEn: 'A fine-rib merino top that layers under everything.', descAr: 'بلوزة ريب ناعمة من صوف الميرينو تناسب الطبقات.', stock: 10 },
  { en: 'Cotton Boxy Tee Dress', ar: 'فستان تيشيرت قطن', category: 'women-dresses', brand: 'atelier-nile', price: 690, options: { size: ['S', 'M', 'L'], color: ['black', 'sand'] }, specs: { material: 'cotton' }, descEn: 'Weekend-ready jersey dress with a clean crew neck.', descAr: 'فستان جيرسيه عملي لنهاية الأسبوع بياقة دائرية بسيطة.', stock: 11 },

  // ── Electronics ──────────────────────────────────────────────────────────
  { en: 'Orbit One Smartphone', ar: 'هاتف أوربت وان', category: 'phones', brand: 'orbit', price: 18500, step: 3500, options: { storage: ['128GB', '256GB', '512GB'], color: ['graphite', 'silver'] }, descEn: '6.4" OLED, all-day battery and a camera that does not shout.', descAr: 'شاشة OLED مقاس 6.4 بوصة وبطارية تدوم طوال اليوم وكاميرا هادئة الأداء.', sale: 1.1, stock: 6 },
  { en: 'Orbit Air Laptop 14"', ar: 'لابتوب أوربت اير 14', category: 'laptops', brand: 'orbit', price: 36500, step: 6000, options: { ram: ['8GB', '16GB', '32GB'], color: ['silver', 'midnight'] }, descEn: 'A 1.2 kg aluminium laptop with a 14" 2.8K display.', descAr: 'لابتوب ألمنيوم بوزن 1.2 كجم وشاشة 14 بوصة بدقة 2.8K.', stock: 4 },
  { en: 'Orbit Studio Headphones', ar: 'سماعات أوربت ستوديو', category: 'audio', brand: 'orbit', price: 4200, options: { color: ['graphite', 'silver'] }, descEn: 'Over-ear, adaptive noise cancelling, 40 hours of playback.', descAr: 'سماعات فوق الأذن بعزل ضوضاء تكيفي وتشغيل 40 ساعة.', sale: 1.2, stock: 9 },
  { en: 'Orbit Pocket Speaker', ar: 'سماعة أوربت بوكيت', category: 'audio', brand: 'orbit', price: 1650, options: { color: ['graphite', 'midnight'] }, descEn: 'Pocket-sized, water resistant and surprisingly full.', descAr: 'سماعة بحجم الجيب مقاومة للماء بصوت مفاجئ الامتلاء.', stock: 14 },
  { en: 'Orbit Tab 11"', ar: 'تابلت أوربت 11', category: 'phones', brand: 'orbit', price: 12500, step: 2500, options: { storage: ['128GB', '256GB'], color: ['silver', 'graphite'] }, descEn: 'An 11" tablet for reading, sketching and the sofa.', descAr: 'تابلت 11 بوصة للقراءة والرسم والجلسات المريحة.', stock: 5 },

  // ── Home & Kitchen ───────────────────────────────────────────────────────
  { en: 'Stoneware Casserole', ar: 'قدر ستونوير', category: 'cookware', brand: 'maison-delta', price: 1450, step: 300, options: { capacity: ['2L', '3L'], color: ['white', 'stone'] }, specs: { material: 'ceramic' }, descEn: 'Enamelled stoneware that goes from oven to table.', descAr: 'ستونوير مطلي ينتقل من الفرن إلى المائدة.', stock: 8 },
  { en: 'Steel Milk Pot', ar: 'إبريق حليب ستانلس', category: 'cookware', brand: 'maison-delta', price: 690, options: { capacity: ['1L', '2L'], color: ['stone'] }, specs: { material: 'steel' }, descEn: 'Tri-ply stainless steel with a pouring lip and a walnut handle.', descAr: 'ستانلس ثلاثي الطبقات بفوهة سكب ومقبض من خشب الجوز.', stock: 12 },
  { en: 'Walnut Serving Board', ar: 'طبق تقديم خشب جوز', category: 'cookware', brand: 'maison-delta', price: 820, options: { color: ['walnut'] }, specs: { material: 'wood' }, descEn: 'A solid walnut board, oiled by hand and finished with a leather loop.', descAr: 'لوح من خشب الجوز الصلب مزيّت يدوياً مع حلقة جلدية.', sale: 1.2, stock: 10 },
  { en: 'Linen Duvet Cover', ar: 'غطاء لحاف كتان', category: 'bedding', brand: 'maison-delta', price: 2350, options: { color: ['white', 'stone', 'walnut'] }, specs: { material: 'linen' }, descEn: 'Stone-washed European linen that softens with every wash.', descAr: 'كتان أوروبي مغسول بالحجر يزداد نعومة مع كل غسلة.', stock: 7 },
  { en: 'Ribbed Ceramic Vase', ar: 'مزهرية سيراميك مضلّعة', category: 'decor', brand: 'maison-delta', price: 540, options: { color: ['white', 'stone'] }, specs: { material: 'ceramic' }, descEn: 'Hand-glazed vase with a quiet vertical rib.', descAr: 'مزهرية مطلية يدوياً بتضليع رأسي هادئ.', stock: 15 },
  { en: 'Woven Linen Throw', ar: 'بطانية كتان منسوجة', category: 'decor', brand: 'maison-delta', price: 1190, options: { color: ['stone', 'walnut'] }, specs: { material: 'linen' }, descEn: 'A generous throw with a hand-knotted fringe.', descAr: 'بطانية واسعة بأهداب معقودة يدوياً.', stock: 9 },

  // ── Beauty ───────────────────────────────────────────────────────────────
  { en: 'Barrier Repair Moisturiser', ar: 'كريم ترطيب لحاجز البشرة', category: 'skincare', brand: 'safra', price: 480, step: 160, options: { volume: ['30ml', '50ml', '100ml'] }, specs: { skin_type: 'dry' }, descEn: 'A ceramide-rich cream that calms and restores dry skin.', descAr: 'كريم غني بالسيراميد يهدّئ البشرة الجافة ويرمّمها.', stock: 20 },
  { en: 'Niacinamide Clarifying Serum', ar: 'سيروم نياسيناميد منقّي', category: 'skincare', brand: 'safra', price: 420, step: 140, options: { volume: ['30ml', '50ml'] }, specs: { skin_type: 'oily' }, descEn: 'Visibly refines pores and balances oil without stripping.', descAr: 'يقلّل ظهور المسام ويوازن الدهون دون جفاف.', sale: 1.25, stock: 18 },
  { en: 'Gentle Gel Cleanser', ar: 'غسول جل لطيف', category: 'skincare', brand: 'safra', price: 290, options: { volume: ['100ml'] }, specs: { skin_type: 'all' }, descEn: 'A soap-free daily cleanser for every skin type.', descAr: 'غسول يومي خالٍ من الصابون لكل أنواع البشرة.', stock: 25 },
  { en: 'Oud & Amber Eau de Parfum', ar: 'عطر عود وعنبر', category: 'fragrance', brand: 'safra', price: 1650, step: 700, options: { volume: ['50ml', '100ml'] }, specs: { skin_type: 'all' }, descEn: 'Warm oud softened with amber, saffron and a touch of vanilla.', descAr: 'عود دافئ ممزوج بالعنبر والزعفران ولمسة فانيليا.', stock: 10 },
  { en: 'Fig & Cedar Candle', ar: 'شمعة تين وأرز', category: 'fragrance', brand: 'safra', price: 380, options: { volume: ['100ml'] }, specs: { skin_type: 'all' }, descEn: 'Hand-poured soy wax with a cotton wick.', descAr: 'شمع صويا مصبوب يدوياً بفتيل قطني.', stock: 16 },

  // ── Accessories ──────────────────────────────────────────────────────────
  { en: 'Everyday Leather Tote', ar: 'حقيبة جلد يومية', category: 'bags', brand: 'walnut-co', price: 3200, options: { color: ['black', 'tan', 'cognac'] }, specs: { material: 'leather' }, descEn: 'Vegetable-tanned leather with a suede-lined interior.', descAr: 'جلد مدبوغ نباتياً مع بطانة سويد داخلية.', sale: 1.15, stock: 6 },
  { en: 'Canvas Weekender', ar: 'حقيبة سفر كانفاس', category: 'bags', brand: 'walnut-co', price: 2450, options: { color: ['black', 'tan'] }, specs: { material: 'canvas' }, descEn: 'Waxed canvas with leather trim and a detachable strap.', descAr: 'كانفاس مشمّع بحواف جلدية وحزام قابل للفك.', stock: 7 },
  { en: 'Minimal Steel Watch 38mm', ar: 'ساعة ستانلس مينيمال 38', category: 'watches', brand: 'walnut-co', price: 5400, options: { color: ['black', 'tan'] }, specs: { material: 'steel' }, descEn: 'A slim automatic with a sapphire crystal and a leather strap.', descAr: 'ساعة أوتوماتيك رفيعة بزجاج سافير وحزام جلدي.', stock: 5 },
  { en: 'Slim Card Wallet', ar: 'محفظة بطاقات رفيعة', category: 'wallets', brand: 'walnut-co', price: 760, options: { color: ['black', 'tan', 'cognac'] }, specs: { material: 'leather' }, descEn: 'Holds six cards and folded notes at barely 6 mm thick.', descAr: 'تتسع لست بطاقات وأوراق نقدية بسُمك لا يتجاوز 6 مم.', stock: 20 },
  { en: 'Bifold Leather Wallet', ar: 'محفظة جلد ثنائية', category: 'wallets', brand: 'walnut-co', price: 1050, options: { color: ['black', 'cognac'] }, specs: { material: 'leather' }, descEn: 'Eight card slots and a full-length note compartment.', descAr: 'ثماني فتحات بطاقات وجيب كامل للأوراق النقدية.', sale: 1.2, stock: 13 },
];

export const GOVERNORATE_FEES: Record<string, { fee: number; min: number; max: number }> = {
  cairo: { fee: 50, min: 1, max: 2 }, giza: { fee: 50, min: 1, max: 2 },
  alexandria: { fee: 60, min: 2, max: 3 }, qalyubia: { fee: 55, min: 1, max: 3 },
  dakahlia: { fee: 70, min: 2, max: 4 }, sharqia: { fee: 70, min: 2, max: 4 }, gharbia: { fee: 70, min: 2, max: 4 },
  monufia: { fee: 70, min: 2, max: 4 }, beheira: { fee: 70, min: 2, max: 4 }, 'kafr-el-sheikh': { fee: 70, min: 2, max: 4 },
  damietta: { fee: 70, min: 2, max: 4 }, 'port-said': { fee: 70, min: 2, max: 4 }, ismailia: { fee: 70, min: 2, max: 4 }, suez: { fee: 70, min: 2, max: 4 },
  fayoum: { fee: 80, min: 2, max: 4 }, 'beni-suef': { fee: 80, min: 2, max: 4 }, minya: { fee: 90, min: 3, max: 5 },
  assiut: { fee: 90, min: 3, max: 5 }, sohag: { fee: 95, min: 3, max: 6 }, qena: { fee: 95, min: 3, max: 6 },
  luxor: { fee: 100, min: 3, max: 6 }, aswan: { fee: 100, min: 3, max: 6 },
  'red-sea': { fee: 120, min: 4, max: 7 }, matrouh: { fee: 120, min: 4, max: 7 }, 'new-valley': { fee: 130, min: 5, max: 8 },
  'south-sinai': { fee: 130, min: 4, max: 7 }, 'north-sinai': { fee: 130, min: 4, max: 7 },
};
