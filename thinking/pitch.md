# Storyloop Pitch

## Problem

Content creators drown in scattered analytics dashboards and struggle to connect storytelling choices to audience response, leaving growth up to guesswork.

## Opportunity

Offer a creative companion that translates raw metrics into narrative insights so creators can systematically refine their craft and replicate success.

## Solution

Storyloop combines a FastAPI backend, React frontend, and automated YouTube sync to deliver a daily Growth Score, weekly metric refreshes, and journal-linked insights that tie creative decisions to measurable outcomes. See [thinking/insights.md](insights.md) for the full scoring and insights logic.

## Product Experience

**Design:** [Main Screen Design](../design/main-screen.png)

- **First-time setup:** Users select which YouTube channel to track on initial login; this preference is saved and automatically loaded for all future sessions.
- **Dashboard layout:** 
  - Top section displays Growth Score and simple score chart
  - Timeline section below shows unified chronological feed
- **Timeline content:** 
  - Content items (videos, lives, shorts, posts, etc.) synced from YouTube
  - Journal entries where creators log experiments and reflections (simple user-created entries)
  - AI-generated insights from agent interactions (coming soon)
- **Agent integration:** Users can interact with an AI agent to ask questions and request insight tracking. The agent can save actions to run in the background, automatically generating insights and adding them to the timeline
  - **Design:** [Agent/Chatbot Design](../design/with-chatbot.png) (Future)
- **Future enhancement:** Video detail pages will provide deeper insights and related notes per video, with most insights being AI-inferred through agent interactions
  - **Design:** [Video Detail Design](../design/video-detail.png) (Future)
- **System health:** Connection status indicator shows backend availability.

## Technical Advantage

Async FastAPI services, APScheduler jobs, SQLite persistence, and a TanStack Query-powered UI provide fast feedback, reliable syncing, and a platform ready for future integrations.

## Roadmap

Expand into multi-platform analytics, add AI-powered guidance, introduce shared types and authentication, and evolve the growth score algorithm for deeper, creator-specific recommendations.

## Goal

Storyloop aims to be a creator’s analytics journal and growth coach, automatically syncing performance data, calculating a focused Growth Score, and pairing metrics with journaled experiments so storytellers can understand what resonates, repeat wins, and chart a deliberate path to audience growth.
