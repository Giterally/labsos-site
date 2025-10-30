-- Ensure project creator is added as Admin, not Lead Researcher
CREATE OR REPLACE FUNCTION public.add_lead_researcher_as_team_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert the project creator as a team member with role 'Admin'
  INSERT INTO public.project_members (project_id, user_id, role, initials)
  VALUES (
    NEW.id,
    NEW.created_by,
    'Admin',
    COALESCE(
      (
        SELECT UPPER(
          array_to_string(
            array(
              SELECT substring(word, 1, 1)
              FROM unnest(string_to_array(full_name, ' ')) AS word
              WHERE word != ''
            ),
            ''
          )
        )
        FROM public.profiles 
        WHERE id = NEW.created_by
      ),
      'U'
    )
  )
  ON CONFLICT (project_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Align helper to return 'Admin' for owners and members
CREATE OR REPLACE FUNCTION public.get_project_role(p_project_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Owner is Admin
  IF is_project_owner(p_project_id, p_user_id) THEN
    RETURN 'Admin';
  END IF;
  
  -- Member role (should be Admin per constraint)
  SELECT role INTO v_role
  FROM project_members
  WHERE project_id = p_project_id 
    AND user_id = p_user_id 
    AND left_at IS NULL;
  
  RETURN COALESCE(v_role, NULL);
END;
$$;

-- Keep single role semantics in get_user_projects
CREATE OR REPLACE FUNCTION public.get_user_projects(user_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  institution text,
  department text,
  status text,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  slug text,
  user_role text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  -- Projects where user is the creator
  SELECT 
    p.id,
    p.name,
    p.description,
    p.institution,
    p.department,
    p.status,
    p.created_by,
    p.created_at,
    p.updated_at,
    p.slug,
    'Admin'::TEXT as user_role
  FROM projects p
  WHERE p.created_by = user_id
  
  UNION ALL
  
  -- Projects where user is an active team member
  SELECT 
    p.id,
    p.name,
    p.description,
    p.institution,
    p.department,
    p.status,
    p.created_by,
    p.created_at,
    p.updated_at,
    p.slug,
    'Admin'::TEXT as user_role
  FROM projects p
  INNER JOIN project_members pm ON p.id = pm.project_id
  WHERE pm.user_id = user_id 
    AND pm.left_at IS NULL
    AND p.created_by != user_id
  
  ORDER BY created_at DESC;
$$;


