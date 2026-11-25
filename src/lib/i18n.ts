import type {
  BeverageCategory,
  ProductFormat,
  ReadinessStatus,
  SeverityLevel,
  SugarTier,
} from '../core/types.ts';

export type Locale = 'ar' | 'en';
export type ThemeName = 'palm-alabaster' | 'excise-night';

export const STATUS_LABELS: Record<ReadinessStatus, Record<Locale, string>> = {
  ready: { ar: 'جاهز للرفع (EX201)', en: 'Ready (EX201)' },
  conditional: { ar: 'مشروط / يحتاج مراجعة', en: 'Conditional' },
  blocked: { ar: 'خطر قسري (1.09 / محجوب)', en: 'Blocked (1.09 Default)' },
};

export const SEVERITY_LABELS: Record<SeverityLevel, Record<Locale, string>> = {
  blocker: { ar: 'عائق حرج', en: 'BLOCKER' },
  warning: { ar: 'تنبيه', en: 'WARNING' },
  info: { ar: 'معلومة', en: 'INFO' },
};

export const CATEGORY_LABELS: Record<BeverageCategory, Record<Locale, string>> = {
  sweetened_beverage: {
    ar: 'مشروب محلى (شرائح حجمية)',
    en: 'Sweetened Beverage (Tiered)',
  },
  energy_drink: {
    ar: 'مشروب طاقة (100% ثابتة)',
    en: 'Energy Drink (Flat 100%)',
  },
  milk_dairy_75plus: {
    ar: 'حليب / ألبان بديلة (75% فأكثر)',
    en: 'Milk / Dairy (75%+ Exempt)',
  },
  natural_juice_100pct: {
    ar: 'عصير طبيعي 100% بدون إضافات',
    en: '100% Natural Juice (Exempt)',
  },
};

export const FORMAT_LABELS: Record<ProductFormat, Record<Locale, string>> = {
  ready_to_drink: { ar: 'جاهز للشرب (RTD)', en: 'Ready-to-Drink (RTD)' },
  liquid_concentrate: { ar: 'مركز سائل / شراب', en: 'Liquid Concentrate' },
  powder_sachet: { ar: 'مسحوق / أكياس', en: 'Powder / Sachet' },
  gel_extract: { ar: 'جل / مستخلص', en: 'Gel / Extract' },
};

export const TIER_LABELS: Record<SugarTier, Record<Locale, string>> = {
  high_109_aed_per_l: {
    ar: 'شريحة مرتفعة (1.09 د.إ/لتر)',
    en: 'High Tier (1.09 AED/L)',
  },
  moderate_079_aed_per_l: {
    ar: 'شريحة متوسطة (0.79 د.إ/لتر)',
    en: 'Moderate Tier (0.79 AED/L)',
  },
  low_or_artificial_zero_aed_per_l: {
    ar: 'منخفض / محليات فقط (0 د.إ/لتر)',
    en: 'Low / Artificial Only (0 AED/L)',
  },
  energy_drink_100pct: {
    ar: 'مشروب طاقة (100% انتقائية)',
    en: 'Energy Drink (100% Rate)',
  },
  exempt_dairy_or_100_juice: {
    ar: 'إعفاء نظامي (ألبان / عصير 100%)',
    en: 'Statutory Exemption (0%)',
  },
};

export const UI_COPY = {
  ar: {
    brandTitle: 'SugarTaxAE — مدقق ضريبة المشروبات المحلاة المتدرجة',
    brandSubtitle:
      'محاكي القرار الوزاري 197/2025 (النافذ منذ 2026-01-01) وقرار الهيئة 10/2025 وفحص مختبر MoIAT',
    langSwitch: 'English',
    themeLight: 'نهاري',
    themeDark: 'ليلي',
    modeServer: 'خادم SQLite WAL',
    modeLocal: 'تخزين محلي $0',
    tabs: {
      dashboard: 'الشرائح والالتزام',
      controls: 'الضوابط والنتائج',
      csv: 'كشف الأصناف CSV',
      vault: 'الخزنة والطباعة PDF',
    },
    presetsLabel: 'سيناريوهات إماراتية جاهزة:',
    publicSealTitle: 'تقرير جاهزية ضريبة المشروبات المحلاة المختوم',
    backToStudio: 'العودة للاستوديو',
    printPdf: 'طباعة / تصدير PDF',
    loadingReport: 'جاري تحميل التقرير المختوم...',
    missingReport: 'تعذر العثور على هذا التقرير المختوم أو لم يُغلق نهائياً بعد.',
    viewsCount: 'عدد المشاهدات',
    sealedAt: 'تاريخ الختم:',
    shaDigest: 'بصمة SHA-256:',
  },
  en: {
    brandTitle: 'SugarTaxAE — UAE Tiered Sweetened Beverage Excise Studio',
    brandSubtitle:
      'Cabinet Decision 197/2025 (Effective 2026-01-01), FTA Decision 10/2025 & MoIAT ISO 17025 Lab Proof',
    langSwitch: 'العربية',
    themeLight: 'Light',
    themeDark: 'Night',
    modeServer: 'SQLite WAL Server',
    modeLocal: '$0 Local Vault',
    tabs: {
      dashboard: 'Tiers & Exposure',
      controls: 'Controls & Findings',
      csv: 'SKU Batch CSV',
      vault: 'Dossier Vault & PDF',
    },
    presetsLabel: 'UAE Beverage Scenarios:',
    publicSealTitle: 'Sealed UAE Beverage Excise Dossier',
    backToStudio: 'Back to Studio',
    printPdf: 'Print / A4 PDF',
    loadingReport: 'Loading sealed excise dossier...',
    missingReport: 'Sealed report was not found or has not been finalized yet.',
    viewsCount: 'Views',
    sealedAt: 'Sealed At:',
    shaDigest: 'SHA-256:',
  },
} as const;
