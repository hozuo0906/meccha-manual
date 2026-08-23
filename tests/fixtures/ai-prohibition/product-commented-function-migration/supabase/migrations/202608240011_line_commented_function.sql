CREATE -- header
  OR -- modifier
  REPLACE -- declaration
  FUNCTION public -- schema
  . -- qualified name
  ai_vectorize(input_text text)
RETURNS text
LANGUAGE sql
AS $$ SELECT input_text $$;
