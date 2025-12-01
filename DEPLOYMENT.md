# Nexus Analytics Deployment Guide

## Overview
I've successfully rebranded your Analytics AI system to "Nexus Analytics" with your new logo. Here's what was changed:

## Changes Made

### 1. Logo and Branding
- ✅ Replaced the logo with your `newlogo.png` (Nexus Quantum branding)
- ✅ Updated `Logo.tsx` and `LogoBar.tsx` components to use the new logo
- ✅ Changed app title from "Analytics AI" to "Nexus Analytics" in `_app.tsx`

### 2. Configuration Setup
- ✅ Created `.env` file from `docker/.env.example`
- ✅ Created `config.yaml` from `docker/config.example.yaml`

## Quick Start (Recommended)

### Prerequisites
- Docker and Docker Compose installed
- OpenAI API key (for the AI features)

### Steps to Run

1. **Set your OpenAI API Key**:
   ```bash
   # Edit the .env file
   nano .env
   # Find the line: OPENAI_API_KEY=
   # Replace with: OPENAI_API_KEY=your_actual_openai_key_here
   ```

2. **Start the application**:
   ```bash
   docker compose -f docker/docker-compose.yaml up -d
   ```

3. **Access the application**:
   - Open your browser to: http://localhost:3000
   - You'll see "Nexus Analytics" with your new logo

### Alternative: Development Mode

If you want to develop the UI only:

```bash
cd analytics-ui
yarn install
yarn dev
```

Then access at http://localhost:3000

## What You'll See

- **Brand Name**: "Nexus Analytics" instead of "Analytics AI"
- **Logo**: Your Nexus Quantum logo in the header and sidebar
- **Same Functionality**: All the NL2SQL and GenBI features work the same

## Architecture

The system has 5 main components that will run in Docker:
- **analytics-ui**: Next.js frontend (your rebranded interface)
- **analytics-ai-service**: Python AI service (handles NL2SQL conversion)
- **analytics-engine**: Data processing engine
- **ibis-server**: Data transformation service
- **qdrant**: Vector database for semantic search

## Customization

If you want to make additional branding changes:
- Logo files: `analytics-ui/public/images/nexus-analytics-logo.png`
- App title: `analytics-ui/src/pages/_app.tsx`
- Colors/styling: `analytics-ui/src/styles/` directory

## Troubleshooting

- If port 3000 is taken, change `HOST_PORT=3000` in `.env`
- For production, update the OpenAI API key and other settings in `.env`
- Check logs with: `docker compose logs -f`