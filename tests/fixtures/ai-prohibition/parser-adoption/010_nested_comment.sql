CREATE /* outer /* nested */ still outer */ FUNCTION public.ai_vectorize(input_text text)
RETURNS text
LANGUAGE sql
AS $$ SELECT input_text $$;
