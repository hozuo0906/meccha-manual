CREATE OR REPLACE FUNCTION public.ai_generate(input_text text)
RETURNS text
LANGUAGE sql
AS $$ SELECT input_text $$;
