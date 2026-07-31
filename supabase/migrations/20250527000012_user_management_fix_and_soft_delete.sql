-- Fix de creación de usuarios + edición/eliminación (soft delete) en gestión de personal

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx ON public.profiles(deleted_at);

CREATE OR REPLACE FUNCTION public.admin_create_staff_user(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT,
  p_role public.user_role
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_email TEXT := lower(trim(p_email));
  v_name TEXT := trim(p_name);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized to create users';
  END IF;

  IF v_email IS NULL OR v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF p_role NOT IN ('waiter', 'kitchen') THEN
    RAISE EXCEPTION 'Only waiter or kitchen roles can be created from admin';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'Email already registered';
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    is_super_admin
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    now(),
    NULL,
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', v_name, 'role', p_role::text),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_user_id,
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email',
    NULL,
    now(),
    now()
  );

  UPDATE public.profiles
  SET
    name = v_name,
    email = v_email,
    role = p_role,
    active = true,
    deleted_at = NULL,
    deleted_by = NULL
  WHERE id = v_user_id;

  PERFORM public.write_audit_log(
    'create',
    'profiles',
    v_user_id,
    jsonb_build_object('email', v_email, 'role', p_role::text, 'created_by', auth.uid())
  );

  RETURN v_user_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[admin_create_staff_user] error: %, SQLSTATE: %, email: %, role: %',
      SQLERRM, SQLSTATE, COALESCE(v_email, '<null>'), COALESCE(p_role::text, '<null>');
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_staff_user(
  p_user_id UUID,
  p_name TEXT,
  p_role public.user_role,
  p_password TEXT DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_name TEXT := trim(p_name);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot edit your own account from staff management';
  END IF;

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF p_role NOT IN ('waiter', 'kitchen') THEN
    RAISE EXCEPTION 'Only waiter or kitchen roles can be managed here';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_profile.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot edit admin account from staff management';
  END IF;

  UPDATE public.profiles
  SET
    name = v_name,
    role = p_role
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  UPDATE auth.users
  SET
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('name', v_name, 'role', p_role::text),
    encrypted_password = CASE
      WHEN p_password IS NOT NULL AND length(trim(p_password)) > 0
        THEN crypt(p_password, gen_salt('bf'))
      ELSE encrypted_password
    END,
    updated_at = now()
  WHERE id = p_user_id;

  PERFORM public.write_audit_log(
    'update',
    'profiles',
    p_user_id,
    jsonb_build_object(
      'name', v_name,
      'role', p_role::text,
      'password_changed', (p_password IS NOT NULL AND length(trim(p_password)) > 0),
      'updated_by', auth.uid()
    )
  );

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_staff_user(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account from staff management';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_profile.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot delete admin account from staff management';
  END IF;

  UPDATE public.profiles
  SET
    active = false,
    deleted_at = now(),
    deleted_by = auth.uid(),
    updated_at = now()
  WHERE id = p_user_id;

  UPDATE auth.users
  SET
    banned_until = '2100-01-01 00:00:00+00'::timestamptz,
    updated_at = now()
  WHERE id = p_user_id;

  PERFORM public.write_audit_log(
    'soft_delete',
    'profiles',
    p_user_id,
    jsonb_build_object('deleted_by', auth.uid())
  );

  RETURN p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_active(
  p_user_id UUID,
  p_active BOOLEAN
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own active status';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_profile.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot change admin account from staff management';
  END IF;

  UPDATE public.profiles
  SET active = p_active
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  UPDATE auth.users
  SET
    banned_until = CASE
      WHEN p_active THEN NULL
      ELSE '2100-01-01 00:00:00+00'::timestamptz
    END,
    updated_at = now()
  WHERE id = p_user_id;

  PERFORM public.write_audit_log(
    'update',
    'profiles',
    p_user_id,
    jsonb_build_object('active', p_active, 'updated_by', auth.uid())
  );

  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_staff_user(TEXT, TEXT, TEXT, public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_staff_user(UUID, TEXT, public.user_role, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_staff_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(UUID, BOOLEAN) TO authenticated;
