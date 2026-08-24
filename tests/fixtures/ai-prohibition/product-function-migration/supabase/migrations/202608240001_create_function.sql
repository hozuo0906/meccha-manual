CREATE FUNCTION public.ai_summarize(input_text text)
RETURNS text
LANGUAGE sql
AS $$ SELECT input_text $$;
