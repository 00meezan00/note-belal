// بيانات Supabase بتاعتك (Project Settings → API)
// المفتاح ده (publishable) معمول عشان يتحط في التطبيق، وكل الجداول مقفولة بـ RLS. متحطش مفتاح sb_secret أبدًا.
export const SUPABASE_URL = 'https://kyoajiyknzcxstzqbyuw.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_6oKXe2e59pEi42pIMO1DVg_11ueuLGb';

// التذكيرات: المفتاح العام بتاع الإشعارات (مش سري)، ولينك الـ Worker بعد ما تعمله على Cloudflare
export const VAPID_PUBLIC_KEY = 'BBLbsINIDeprrnws6UtrjZe5mmCFsk6Z2-P7RvNRCHIWByqzbXL51HusV42285z3WUZA83488EUK5gsjyhrSKYo';
export const WORKER_URL = 'https://nota-reminders.naserbelal331.workers.dev';
