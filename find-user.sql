-- Find your user ID
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'your_email@example.com'  -- Replace with your actual email
ORDER BY created_at DESC 
LIMIT 1;
