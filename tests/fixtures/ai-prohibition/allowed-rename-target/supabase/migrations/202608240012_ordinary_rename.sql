-- ALTER MATERIALIZED VIEW public.manual_summaries RENAME TO ai_commented;
ALTER MATERIALIZED VIEW public.manual_summaries RENAME TO ordinary_summaries;
SELECT 'ALTER TABLE public.manual_records RENAME TO ai_literal';
