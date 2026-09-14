# Ybex — India's Most Transparent Influencer Marketplace (PRD)

## Original Problem Statement
User wants a HashFame-like app but as a website (Ybex - influencer marketplace) with:
- Complete working app
- Best UI, animations, transitions
- All features working
- Auth properly working
- Best UI components
- Unique USPs (Rate Card Transparency, Verified Performance, Bharat Creators, ROI Tracking)

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB) at port 8001, all routes prefixed `/api`
- **Frontend**: React 19 + React Router v7 + Tailwind + Shadcn UI + Framer Motion + Lucide
- **Auth**: JWT email/password + Emergent-managed Google OAuth (both supported via cookie or Bearer)
- **Design**: Archetype "Swiss & High-Contrast" — Bone white (#F7F5F2) + Vermillion (#E84A27) + Forest Green (#1A4331). Cabinet Grotesk + IBM Plex Sans + JetBrains Mono fonts.

## User Personas
1. **Creator**: Indian influencer (Tier 2/3 city focus), creates public rate card, applies to campaigns
2. **Brand**: Marketer searching for creators with verified data, posts campaigns
3. **Talent Manager**: Manages multiple creators (basic support, full agency mode P2)

## Core Requirements (Static)
- Public creator profiles with transparent rate cards
- 11+ filter search with verified engagement metrics
- Campaign marketplace (post / browse / apply)
- Wave + Collab request system with negotiation
- Performance Rank Leaderboard
- Mock AI scoring (engagement rate, fake follower %, performance score)

## What's Been Implemented (2026-02-09)
### Backend (`server.py`)
- ✅ `/api/auth/signup`, `/auth/login`, `/auth/session` (Google OAuth), `/auth/me`, `/auth/logout`, `/auth/role`
- ✅ `/api/creators` (search with 11 filters), `/api/creators/{id}` (profile view + view count)
- ✅ `/api/creators/profile` (upsert), `/api/brands/profile`, `/api/brands/me`
- ✅ `/api/campaigns` (list, post, detail), `/api/campaigns/apply`
- ✅ `/api/collabs/wave`, `/api/collabs/request`, `/api/collabs/{id}/action`, `/api/collabs` (list)
- ✅ `/api/leaderboard`, `/api/notifications`, `/api/dashboard/stats`

### Frontend Pages
- ✅ Landing (hero, USP bento, featured creators, how it works, CTA)
- ✅ Login / Signup (with Google OAuth)
- ✅ AuthCallback (session_id exchange)
- ✅ Onboarding (Role select → Creator/Brand multi-field flow)
- ✅ Explore (search + 11 filters sidebar + creator grid)
- ✅ Creator Profile (sticky photo, rate card, performance metrics, social, collab modal)
- ✅ Dashboard (Creator/Brand views with stats, recent collabs, campaigns)
- ✅ Campaigns (list + filters + post campaign modal)
- ✅ Campaign Detail (apply with proposal OR view applicants if owner)
- ✅ Collabs (4 tabs: received/sent collabs/waves with accept/decline)
- ✅ Leaderboard (filterable by category)
- ✅ Notifications + Settings

### Seed Data
- 25 realistic Bharat creators across 22 cities, 19 categories
- 5 sample live campaigns from Nova Brand Co

## Prioritized Backlog
### P0 (done)
- Auth (email + Google)
- Creator profiles + search
- Campaign marketplace
- Collab system
- Performance leaderboard
- Dashboards
- Notifications

### P1 (deferred)
- Real-time chat between creator/brand
- File upload for portfolio (object storage)
- Real social oAuth (auto-fetch IG/YT follower counts)
- Re-collab suggestion engine
- ROI calculator (post-campaign performance scoring)
- Referral / invite system
- Email verification
- Team management for brand accounts
- Talent agency mode

### P2 (later)
- Actual AI-based fake follower detection (vs mock)
- Mobile native apps
- Stripe payment escrow
- Multi-language UI (Hindi, Tamil, Telugu)
- Analytics dashboard (Mixpanel)
