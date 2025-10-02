-- Check if users exist in auth.users
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 5;

-- Check if profiles exist
SELECT id, email, full_name, created_at 
FROM public.profiles 
ORDER BY created_at DESC 
LIMIT 5;
