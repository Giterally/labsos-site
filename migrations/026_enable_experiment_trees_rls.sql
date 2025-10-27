-- Enable RLS on experiment_trees
ALTER TABLE public.experiment_trees ENABLE ROW LEVEL SECURITY;

-- Policy: Project members can view trees
CREATE POLICY "Members can view experiment trees"
ON public.experiment_trees FOR SELECT
USING (
  project_id IN (
    SELECT pm.project_id
    FROM public.project_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.left_at IS NULL
  )
);

-- Policy: Project members can create trees
CREATE POLICY "Members can create experiment trees"
ON public.experiment_trees FOR INSERT
WITH CHECK (
  project_id IN (
    SELECT pm.project_id
    FROM public.project_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.left_at IS NULL
  )
);

-- Policy: Project members can update trees
CREATE POLICY "Members can update experiment trees"
ON public.experiment_trees FOR UPDATE
USING (
  project_id IN (
    SELECT pm.project_id
    FROM public.project_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.left_at IS NULL
  )
);

-- Policy: Project members can delete trees
CREATE POLICY "Members can delete experiment trees"
ON public.experiment_trees FOR DELETE
USING (
  project_id IN (
    SELECT pm.project_id
    FROM public.project_members pm
    WHERE pm.user_id = auth.uid()
    AND pm.left_at IS NULL
  )
);
