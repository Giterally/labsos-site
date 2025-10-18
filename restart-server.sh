#!/bin/bash

# Comprehensive Server Restart Script
# This ensures we always know exactly what version is running

echo "🔄 Starting comprehensive server restart..."

# Step 1: Kill ALL Next.js processes
echo "📋 Step 1: Killing all Next.js processes..."
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true

# Kill processes on specific ports
echo "📋 Killing processes on ports 3000 and 3001..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

# Wait a moment for processes to fully terminate
sleep 2

# Step 2: Verify no processes are running
echo "📋 Step 2: Verifying no Next.js processes are running..."
REMAINING_PROCESSES=$(ps aux | grep -E "(next|node)" | grep -v grep | grep -v "Notion\|Cursor\|Code" | wc -l)
if [ "$REMAINING_PROCESSES" -gt 0 ]; then
    echo "⚠️  Warning: $REMAINING_PROCESSES processes still running:"
    ps aux | grep -E "(next|node)" | grep -v grep | grep -v "Notion\|Cursor\|Code"
    echo "🔨 Force killing remaining processes..."
    ps aux | grep -E "(next|node)" | grep -v grep | grep -v "Notion\|Cursor\|Code" | awk '{print $2}' | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Step 3: Clear all caches
echo "📋 Step 3: Clearing all caches..."
rm -rf .next
rm -rf node_modules/.cache
rm -rf .turbo

# Step 4: Update version timestamp
echo "📋 Step 4: Updating version timestamp..."
sed -i '' "s/\*\*Last Updated\*\*: .*/\*\*Last Updated\*\*: $(date)/" VERSION.md

# Step 5: Start fresh server
echo "📋 Step 5: Starting fresh server on port 3000..."
PORT=3000 npm run dev &

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 8

# Step 6: Verify server is running with correct version
echo "📋 Step 6: Verifying server version..."
VERSION_RESPONSE=$(curl -s http://localhost:3000/api/version 2>/dev/null || echo "ERROR")
if [[ "$VERSION_RESPONSE" == *"v1.0.0-progress-fix"* ]]; then
    echo "✅ Server is running with correct version: v1.0.0-progress-fix"
    echo "🌐 Server URL: http://localhost:3000"
    echo "📊 Version API: http://localhost:3000/api/version"
else
    echo "❌ Server version verification failed!"
    echo "Response: $VERSION_RESPONSE"
    echo "🔍 Checking server status..."
    curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000 || echo "Server not responding"
fi

# Step 7: Show final status
echo ""
echo "🎉 Server restart complete!"
echo "📋 Final status:"
echo "   - Port: 3000"
echo "   - Version: v1.0.0-progress-fix"
echo "   - URL: http://localhost:3000"
echo "   - Version check: http://localhost:3000/api/version"
echo ""
echo "🧪 To test cross-tab sync:"
echo "   1. Open http://localhost:3000/dashboard/projects/new/import"
echo "   2. Click 'Generate AI Proposals'"
echo "   3. Check localStorage for 'active_proposal_job_new'"
echo "   4. Open new tab - should show same progress"
echo "   5. Refresh page - should resume progress"
