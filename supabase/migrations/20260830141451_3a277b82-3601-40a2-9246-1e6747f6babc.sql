
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM authenticated;
