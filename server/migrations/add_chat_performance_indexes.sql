-- Chat performance indexes
-- Run once against each DB (zvbl, lcysba, etc.)

-- Primary lookup: per-channel messages ordered by time (used by every message fetch + LATERAL joins in GET /channels)
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created
  ON chat_messages (channel_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Unread count: per-channel messages after a timestamp (LATERAL subquery in GET /channels)
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created_asc
  ON chat_messages (channel_id, created_at ASC)
  WHERE deleted_at IS NULL;

-- Membership lookup: given a user, find their channels quickly
CREATE INDEX IF NOT EXISTS idx_chat_channel_members_user
  ON chat_channel_members (user_id, channel_id);

-- Team channel lookup: given a team_id, find the channel
CREATE INDEX IF NOT EXISTS idx_chat_channels_team
  ON chat_channels (team_id)
  WHERE type = 'team' AND team_id IS NOT NULL;

-- user_permissions team lookup (used in GET /channels WHERE clause for regular users)
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_team
  ON user_permissions (user_id, team_id)
  WHERE is_active = TRUE AND team_id IS NOT NULL;
