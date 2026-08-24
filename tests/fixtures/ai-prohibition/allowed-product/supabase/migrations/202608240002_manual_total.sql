CREATE FUNCTION public.calculate_manual_total(amount integer)
RETURNS integer
LANGUAGE sql
AS $$ SELECT amount $$;
