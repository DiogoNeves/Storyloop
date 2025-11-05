"""YouTube OAuth 2.0 experimentation script.

This script demonstrates OAuth 2.0 authentication flow for YouTube Data API.
It follows the pattern from: https://googleapis.github.io/google-api-python-client/docs/oauth-installed.html

I intend to use this script to experiment with the YouTube Data API and
understand the authentication flow, before integrating it into the backend.
"""

from __future__ import annotations

import os
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# The CLIENT_SECRETS_FILE variable specifies the name of a file that contains
# the OAuth 2.0 information for this application, including its client_id and
# client_secret.
CLIENT_SECRETS_FILE = Path(__file__).parent.parent / "client_secret.json"

# This access scope grants read-only access to the authenticated user's YouTube account.
# See: https://developers.google.com/youtube/v3/guides/auth/installed-apps
SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]
API_SERVICE_NAME = "youtube"
API_VERSION = "v3"


def get_authenticated_service():
    """Create and return an authenticated YouTube service object."""
    flow = InstalledAppFlow.from_client_secrets_file(
        str(CLIENT_SECRETS_FILE), SCOPES
    )
    # You can use either run_console() or run_local_server() here
    # run_console() - user pastes code manually
    # run_local_server() - opens browser and listens on localhost
    credentials = flow.run_local_server(
        host="localhost",
        port=8080,
        authorization_prompt_message="Please visit this URL: {url}",
        success_message="The auth flow is complete; you may close this window.",
        open_browser=True,
    )
    return build(API_SERVICE_NAME, API_VERSION, credentials=credentials)


def list_youtube_channels(service, **kwargs):
    """List YouTube channels for the authenticated user."""
    # TODO: Implement channel listing logic
    # Example: service.channels().list(part="snippet", mine=True).execute()
    pass


def list_youtube_videos(service, **kwargs):
    """List YouTube videos for the authenticated user."""
    # TODO: Implement video listing logic
    # Example: service.videos().list(part="snippet", myRating="like").execute()
    pass


def main():
    """Main entry point for the script."""
    # When running locally, disable OAuthlib's HTTPs verification.
    # When running in production *do not* leave this option enabled.
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

    service = get_authenticated_service()

    # TODO: Add your experiment code here
    # Example:
    # channels = list_youtube_channels(service)
    # videos = list_youtube_videos(service)


if __name__ == "__main__":
    main()
