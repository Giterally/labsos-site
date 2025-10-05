# Database Setup Instructions

## 1. Create the user_profiles table

Go to your Supabase dashboard and run this SQL in the SQL Editor:

```sql
-- User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  institution TEXT NOT NULL,
  department TEXT,
  position TEXT,
  bio TEXT,
  research_areas TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  orcid_id TEXT,
  google_scholar_id TEXT,
  website TEXT,
  linkedin TEXT,
  twitter TEXT,
  orcid_data JSONB,
  google_scholar_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own profile" ON user_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_institution ON user_profiles(institution);
CREATE INDEX IF NOT EXISTS idx_user_profiles_research_areas ON user_profiles USING GIN(research_areas);
CREATE INDEX IF NOT EXISTS idx_user_profiles_keywords ON user_profiles USING GIN(keywords);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_profiles_updated_at 
  BEFORE UPDATE ON user_profiles 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
```

## 2. Test the flow

1. Go to http://localhost:3000
2. Click "Get Started" 
3. Sign in with your existing account (chandernoah@gmail.com)
4. You should now be redirected to the profile setup page
5. Complete the profile creation
6. You'll be redirected to the dashboard

## What was fixed

- Dashboard now checks if user has a profile before loading
- If no profile exists, user is redirected to profile setup
- Profile setup creates the profile and redirects back to dashboard
- Loading states show appropriate messages during the process
