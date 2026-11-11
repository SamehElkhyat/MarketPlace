/** `demo_admin` = read-only back-office access for portfolio reviewers (every non-GET admin call is refused). */
export const USER_ROLES = ['customer', 'admin', 'demo_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'banned'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PRODUCT_STATUSES = ['draft', 'published'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const MAX_CATEGORY_DEPTH = 3;

export const PAYMENT_METHODS = ['cod', 'card', 'wallet', 'fawry'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CURRENCY = 'EGP' as const;

/** The 27 Egyptian governorates (English slug + Arabic label) used for addresses and shipping zones. */
export const GOVERNORATES = [
  { key: 'cairo', ar: 'القاهرة', en: 'Cairo' },
  { key: 'giza', ar: 'الجيزة', en: 'Giza' },
  { key: 'alexandria', ar: 'الإسكندرية', en: 'Alexandria' },
  { key: 'dakahlia', ar: 'الدقهلية', en: 'Dakahlia' },
  { key: 'red-sea', ar: 'البحر الأحمر', en: 'Red Sea' },
  { key: 'beheira', ar: 'البحيرة', en: 'Beheira' },
  { key: 'fayoum', ar: 'الفيوم', en: 'Fayoum' },
  { key: 'gharbia', ar: 'الغربية', en: 'Gharbia' },
  { key: 'ismailia', ar: 'الإسماعيلية', en: 'Ismailia' },
  { key: 'monufia', ar: 'المنوفية', en: 'Monufia' },
  { key: 'minya', ar: 'المنيا', en: 'Minya' },
  { key: 'qalyubia', ar: 'القليوبية', en: 'Qalyubia' },
  { key: 'new-valley', ar: 'الوادي الجديد', en: 'New Valley' },
  { key: 'suez', ar: 'السويس', en: 'Suez' },
  { key: 'aswan', ar: 'أسوان', en: 'Aswan' },
  { key: 'assiut', ar: 'أسيوط', en: 'Assiut' },
  { key: 'beni-suef', ar: 'بني سويف', en: 'Beni Suef' },
  { key: 'port-said', ar: 'بورسعيد', en: 'Port Said' },
  { key: 'damietta', ar: 'دمياط', en: 'Damietta' },
  { key: 'sharqia', ar: 'الشرقية', en: 'Sharqia' },
  { key: 'south-sinai', ar: 'جنوب سيناء', en: 'South Sinai' },
  { key: 'kafr-el-sheikh', ar: 'كفر الشيخ', en: 'Kafr El Sheikh' },
  { key: 'matrouh', ar: 'مطروح', en: 'Matrouh' },
  { key: 'luxor', ar: 'الأقصر', en: 'Luxor' },
  { key: 'qena', ar: 'قنا', en: 'Qena' },
  { key: 'north-sinai', ar: 'شمال سيناء', en: 'North Sinai' },
  { key: 'sohag', ar: 'سوهاج', en: 'Sohag' },
] as const;

export const GOVERNORATE_KEYS = GOVERNORATES.map((g) => g.key) as unknown as readonly [string, ...string[]];
