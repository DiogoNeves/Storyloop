# Setting Up OAuth for YouTube Analytics API

This guide walks you through setting up OAuth authentication to enable the YouTube Analytics API features in the `youtube_scorecard.py` script.

## Prerequisites

- A Google account with access to YouTube channel data
- The channel you want to analyze must be owned by (or accessible to) the authenticated account

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter a project name (e.g., "Storyloop YouTube Analytics")
4. Click "Create"

## Step 2: Enable Required APIs

1. In the Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for and enable:
   - **YouTube Data API v3**
   - **YouTube Analytics API**

## Step 3: Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose "External" (unless you have a Google Workspace account)
3. Fill in the required fields:
   - App name: "Storyloop YouTube Scorecard"
   - User support email: Your email
   - Developer contact email: Your email
4. Click "Save and Continue"
5. On the "Scopes" page, click "Add or Remove Scopes"
6. Add these scopes:
   - `https://www.googleapis.com/auth/youtube.readonly`
   - `https://www.googleapis.com/auth/yt-analytics.readonly`
7. Click "Update" → "Save and Continue"
8. On "Test users" (if in Testing mode), add your Google account email
9. Click "Save and Continue" through the remaining screens

## Step 4: Create OAuth Client Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Choose application type: **Desktop app**
4. Give it a name (e.g., "Storyloop Desktop Client")
5. Click "Create"
6. In the popup, click "Download JSON"
7. Save the downloaded file as `client_secrets.json` in the repository root (or scripts directory)

## Step 5: Use the Script with Analytics

1. Place `client_secrets.json` in your project root (or set `GOOGLE_OAUTH_CLIENT_SECRETS` env var to point to it)
2. Run the script with the `--use-analytics` flag:

```bash
python scripts/youtube_scorecard.py <channel-handle-or-url> --use-analytics
```

3. On first run, the script will:
   - Display an authorization URL in your terminal
   - Open your browser (or prompt you to visit the URL)
   - Ask you to sign in and grant permissions
   - Display a verification code
   - Prompt you to paste the code back into the terminal
   - Save credentials to `youtube_token.json` for future use

4. Subsequent runs will use the saved token automatically (until it expires, then it will refresh automatically)

## Troubleshooting

### "OAuth credentials not available"
- Ensure `client_secrets.json` exists in the expected location
- Check that `GOOGLE_OAUTH_CLIENT_SECRETS` env var points to the correct file if set

### "Google API libraries not installed"
Install the required packages:
```bash
pip install google-auth google-auth-oauthlib google-api-python-client
```

Or if using `uv`:
```bash
cd backend
uv add google-auth google-auth-oauthlib google-api-python-client
```

### "OAuth authentication failed"
- Verify your client_secrets.json file is valid JSON
- Check that you've enabled both YouTube Data API v3 and YouTube Analytics API
- Ensure your OAuth consent screen is configured correctly
- Make sure you're using a "Desktop app" OAuth client type

### "Failed to fetch analytics for video"
- The authenticated account must have access to the channel's analytics
- Analytics data may not be available for very recent videos (< 24 hours)
- The channel ID in the request must match the authenticated user's channel

## Token Management

- Credentials are saved to `youtube_token.json` in the current directory
- Tokens refresh automatically when expired
- To revoke access, delete `youtube_token.json` and remove the app from your Google Account settings: https://myaccount.google.com/permissions

## Quota Considerations

- YouTube Data API v3: 10,000 units per day (default quota)
- YouTube Analytics API: 50,000 queries per day per project
- Each video analytics query counts as 1 unit/quota

## Security Notes

- Never commit `client_secrets.json` or `youtube_token.json` to version control
- Add these files to `.gitignore`
- Store `client_secrets.json` securely and limit access

