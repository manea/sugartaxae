import type { SugarControlSpec } from './types.ts';

export const SUGARTAXAE_TOOL_VERSION = '0.5.0';

export const HIGH_SUGAR_THRESHOLD_G_PER_100ML = 8;
export const MODERATE_SUGAR_THRESHOLD_G_PER_100ML = 5;
export const MILK_EXEMPTION_MIN_PCT = 75;

export const HIGH_TIER_RATE_AED_PER_L = 1.09;
export const MODERATE_TIER_RATE_AED_PER_L = 0.79;
export const LOW_TIER_RATE_AED_PER_L = 0;

export const LEGACY_SWEETENED_EXCISE_PCT = 50;
export const ENERGY_DRINK_EXCISE_PCT = 100;

export const EMARATAX_EXCISE_DUE_DAY = 15;
export const LATE_PAYMENT_INTEREST_ANNUAL_PCT = 14;
export const CD75_DOC_PENALTY_FIRST_AED = 10_000;
export const CD75_DOC_PENALTY_REPEAT_24M_AED = 20_000;

export const LEGAL_DISCLAIMER_EN =
  'Notice: SugarTaxAE is an independent UAE Sweetened Beverage Excise Tax readiness estimator and is NOT affiliated with, endorsed by, or connected to the UAE Federal Tax Authority (FTA), Ministry of Industry and Advanced Technology (MoIAT / ECAS), Ministry of Finance (MoF), or EmaraTax portal. Outputs are indicative only and do not constitute tax, regulatory, laboratory, or legal advice.';

export const LEGAL_DISCLAIMER_AR =
  'تنبيه مهم: أداة SugarTaxAE أداة تقنية مستقلة لتقييم جاهزية الضريبة الانتقائية المتدرجة على المشروبات المحلاة وليست تابعة أو معتمدة من الهيئة الاتحادية للضرائب (FTA) أو وزارة الصناعة والتكنولوجيا المتقدمة (MoIAT / ECAS) أو وزارة المالية الإماراتية (MoF) أو بوابة EmaraTax، ومخرجاتها استرشادية ولا تُعد استشارة ضريبية أو مخبرية أو قانونية.';

export const SUGAR_CONTROLS: readonly SugarControlSpec[] = [
  {
    id: 'SUG-CTRL-01',
    weight: 20,
    titleEn: 'MoIAT ISO/IEC 17025 Accredited Sugar Lab Testing (FTA 10/2025)',
    titleAr: 'شهادة مختبر معتمد ISO 17025 لتحليل السكر لكل 100 مل (قرار 10/2025)',
    descriptionEn:
      'Obtain accredited laboratory test reports quantifying total sugars & sweeteners per 100ml ready-to-drink volume so EmaraTax avoids the AED 1.09/L missing-lab default.',
    descriptionAr:
      'توفير تقارير مختبر معتمد ISO/IEC 17025 تثبت إجمالي السكر والمحليات لكل 100 مل لتفادي التصنيف القسري بأعلى شريحة 1.09 د.إ/لتر.',
  },
  {
    id: 'SUG-CTRL-02',
    weight: 20,
    titleEn: 'MoIAT ECAS Conformity & EmaraTax EX201 SKU Registration',
    titleAr: 'شهادة مطابقة MoIAT ECAS وتسجيل الأصناف في إقرار EmaraTax',
    descriptionEn:
      'Link verified MoIAT conformity certificates and barcodes cleanly in EmaraTax Excise product registration ahead of import or local production.',
    descriptionAr:
      'ربط شهادات المطابقة الصادرة عن وزارة الصناعة والتكنولوجيا المتقدمة ببطاقة الصنف في منصة EmaraTax قبل الاستيراد أو الإنتاج.',
  },
  {
    id: 'SUG-CTRL-03',
    weight: 15,
    titleEn: 'Concentrate, Powder & Gel Reconstitution Yield Sheet',
    titleAr: 'جدول تخفيف المركزات والمساحيق والهلام وحجم اللتر النهائي',
    descriptionEn:
      'Document standardized manufacturer dilution guidelines and ready-to-drink yield litres for non-RTD syrups, powders, gels, and extracts.',
    descriptionAr:
      'توثيق نسب التخفيف المعتمدة من المصنّع وكمية اللترات النهائية الجاهزة للشرب للمركزات والمساحيق والهلام والمستخلصات.',
  },
  {
    id: 'SUG-CTRL-04',
    weight: 15,
    titleEn: 'Natural Juice (100%) & Dairy (>=75%) Exemption Substantiation',
    titleAr: 'إثبات استثناء العصائر الطبيعية 100% ومنتجات الألبان >= 75%',
    descriptionEn:
      'Evidence 100% natural fruit/vegetable juice purity (zero added sugar/sweeteners) or >=75% milk/qualified plant-milk share for excise exclusion.',
    descriptionAr:
      'توثيق خلو العصائر الطبيعية من أي سكر مضاف أو محليات أو استيفاء نسبة >= 75% حليب أو بديل مؤهل لتطبيق الإعفاء النظامي.',
  },
  {
    id: 'SUG-CTRL-05',
    weight: 15,
    titleEn: 'Energy Drink 100% Segregation & Mixed-Sweetener Controls',
    titleAr: 'فصل مشروبات الطاقة (100%) وضبط الخلط بين السكر والمحليات',
    descriptionEn:
      'Keep energy drinks segregated on the dedicated 100% excise rate and ensure artificial sweeteners never offset real sugar in tier calculations.',
    descriptionAr:
      'فصل مشروبات الطاقة تحت نسبة الـ 100% المخصصة وضمان عدم اعتبار المحليات الصناعية مخصومة من السكر الحقيقي عند وجودهما معاً.',
  },
  {
    id: 'SUG-CTRL-06',
    weight: 15,
    titleEn: 'EX201 Day-15 Filing SLA & Reformulation Audit Trail',
    titleAr: 'انضباط مهلة اليوم 15 للإقرار وسجل إعادة الصياغة والتقارير',
    descriptionEn:
      'Reconcile monthly Excise Tax declarations and payments by the 15th of the following month and retain lab certificates for FTA inspection.',
    descriptionAr:
      'مطابقة إقرارات EX201 وسداد الضريبة الانتقائية قبل اليوم 15 من الشهر التالي مع حفظ شهادات المختبر للفحص الضريبي.',
  },
] as const;
