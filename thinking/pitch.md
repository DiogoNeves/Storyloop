# Storyloop Pitch

## Problem

New YouTube creators feel lost and directionless, especially when they’re trying to grow from zero traction to their first 100k subscribers or views. They want to know what to do next, but dashboards dump raw metrics instead of showing a path that leads to results.

## Opportunity

Offer a creative companion that transforms early-channel noise into clear, user-driven next steps so beginners can build repeatable wins without relying on generic “best practices.” Give creators direction they can trust while still celebrating the metrics that prove their experiments are working.

## Solution

Storyloop combines a FastAPI backend, React frontend, and YouTube integration to deliver user-driven direction: natural language goals turn into guided experiments, metric tracking shows what actually moved the needle, and journal entries tie creative decisions to measurable outcomes on the road to 100k.

## Product Experience

**Design:** [Main Screen Design](../design/main-screen.png)

- **First-time setup:** Users select which YouTube channel to track on initial login; this preference is saved and automatically loaded for all future sessions.
- **Dashboard layout:**
  - Timeline section shows unified chronological feed
- **Timeline content:**
  - Content items (videos, lives, shorts, posts, etc.) synced from YouTube
  - Journal entries where creators log experiments and reflections (simple user-created entries)
- **Agent integration:** Users can interact with an AI agent to ask questions about their channel and content
  - **Design:** [Agent/Chatbot Design](../design/with-chatbot.png)
- **Future enhancement:** Video detail pages will provide deeper analysis and related notes per video
  - **Design:** [Video Detail Design](../design/video-detail.png)
- **System health:** Connection status indicator shows backend availability.

## Technical Advantage

Async FastAPI services, SQLite persistence, and a TanStack Query-powered UI provide fast feedback and a platform ready for future integrations.

## Roadmap

Expand into multi-platform analytics, add AI-powered guidance, introduce shared types and authentication, and build creator-specific recommendations.

## Goal

Storyloop aims to be a new creator's analytics journal and growth coach, syncing performance data and pairing metrics with journaled experiments so storytellers can discover what works, repeat it, and build momentum with confidence.
