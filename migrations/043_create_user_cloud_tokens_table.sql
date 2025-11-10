-- Create user_cloud_tokens table for storing encrypted OAuth tokens
CREATE TABLE IF NOT EXISTS user_cloud_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider text NOT NULL, -- 'googledrive', 'onedrive', 'dropbox', 'sharepoint'
  access_token text NOT NULL, -- Encrypted
  refresh_token text, -- Encrypted (if available)
  expires_at timestamptz,
  token_metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_cloud_tokens_user_id ON user_cloud_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cloud_tokens_provider ON user_cloud_tokens(provider);
CREATE INDEX IF NOT EXISTS idx_user_cloud_tokens_expires_at ON user_cloud_tokens(expires_at);

-- Enable RLS
ALTER TABLE user_cloud_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own tokens
CREATE POLICY "Users can view their own cloud tokens"
  ON user_cloud_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cloud tokens"
  ON user_cloud_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cloud tokens"
  ON user_cloud_tokens
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cloud tokens"
  ON user_cloud_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

