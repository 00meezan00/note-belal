// بيانات Supabase بتاعتك (Project Settings → API)
// المفتاح ده (publishable) معمول عشان يتحط في التطبيق، وكل الجداول مقفولة بـ RLS. متحطش مفتاح sb_secret أبدًا.
export const SUPABASE_URL = 'https://kyoajiyknzcxstzqbyuw.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_6oKXe2e59pEi42pIMO1DVg_11ueuLGb';

// التذكيرات: المفتاح العام بتاع الإشعارات (مش سري)، ولينك الـ Worker بعد ما تعمله على Cloudflare
export const VAPID_PUBLIC_KEY = 'BPHukTRrMjm25gFLO-6ZPBnD_Mo69KUZjaw_h7zCLVrX4Xuz_Agip85q0qIS3O7u4pS0LQtGBe00lJh8nLM0Ngs';
export const WORKER_URL = 'https://nota-reminders.naserbelal331.workers.dev';
