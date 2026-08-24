CREATE FUNCTION "tenant prod"
  .
  "ai_vectorize"(input_text text)
RETURNS text
LANGUAGE sql
AS $$ SELECT input_text $$;
