-- Create function to update project member initials when profile name changes
CREATE OR REPLACE FUNCTION public.update_project_member_initials()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if full_name has changed
  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    -- Update initials in all project_members records for this user
    UPDATE public.project_members 
    SET initials = CASE 
      WHEN NEW.full_name IS NOT NULL AND NEW.full_name != '' THEN
        UPPER(
          array_to_string(
            array(
              SELECT substring(word, 1, 1) 
              FROM unnest(string_to_array(NEW.full_name, ' ')) AS word
              WHERE word != ''
            ), 
            ''
          )
        )
      ELSE 'U'
    END
    WHERE user_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update project member initials when profile is updated
DROP TRIGGER IF EXISTS update_project_member_initials_trigger ON public.profiles;
CREATE TRIGGER update_project_member_initials_trigger
  AFTER UPDATE ON public.profiles
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_project_member_initials();

-- Update existing project_members records with correct initials
UPDATE public.project_members 
SET initials = CASE 
  WHEN p.full_name IS NOT NULL AND p.full_name != '' THEN
    UPPER(
      array_to_string(
        array(
          SELECT substring(word, 1, 1) 
          FROM unnest(string_to_array(p.full_name, ' ')) AS word
          WHERE word != ''
        ), 
        ''
      )
    )
  ELSE 'U'
END
FROM public.profiles p
WHERE project_members.user_id = p.id;
