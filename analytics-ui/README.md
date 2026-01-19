# Analytics UI - Web Interface

## Overview

The Analytics UI is a Next.js-based web application that provides a user-friendly interface for the NQRust-Analytics platform. It enables users to connect to data sources, build semantic models, and query data using natural language.

## Key Features

### User Management
- **User Registration & Login**: Built-in email/password authentication
- **OAuth Integration**: Optional Google and GitHub OAuth login
- **Role-Based Access Control**: Admin, Editor, and Viewer roles
- **User Profile Management**: Update display name and password

### Multi-Dashboard Support
- **Create Multiple Dashboards**: Organize visualizations into separate dashboards
- **Set Default Dashboard**: Choose which dashboard loads on login
- **Star Dashboards**: Bookmark frequently accessed dashboards
- **Dashboard Sharing**: Share dashboards with team members (view or edit permissions)

### Chat History Management
- **User-Specific History**: Each user has their own private chat history
- **Thread Sharing**: Share conversation threads with other users
- **Rename & Delete**: Manage your conversation history

## Technology Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Ant Design + Custom CSS
- **State Management**: Apollo Client (GraphQL)
- **Database**: SQLite (default) or PostgreSQL

## Prerequisites

- Node.js 18.x or higher
- Yarn or npm package manager
- Running Analytics Engine and AI Service (for full functionality)

## Quick Start

### 1. Check Node Version

```bash
node -v  # Should be 18.x or higher
```

### 2. Install Dependencies

```bash
yarn install
# or
npm install
```

### 3. Database Configuration (Optional)

#### Using PostgreSQL

Set environment variables:

```bash
# Windows
SET DB_TYPE=pg
SET PG_URL=postgres://user:password@localhost:5432/dbname

# Linux/macOS
export DB_TYPE=pg
export PG_URL=postgres://user:password@localhost:5432/dbname
```

#### Using SQLite (Default)

```bash
# Windows
SET DB_TYPE=sqlite
SET SQLITE_FILE=./db.sqlite3

# Linux/macOS
export DB_TYPE=sqlite
export SQLITE_FILE=./db.sqlite3
```

### 4. Run Database Migrations

```bash
yarn migrate
# or
npm run migrate
```

**Important**: The migrations will create all necessary tables for:
- User management (users, roles, permissions)
- Project membership and access control
- Multi-dashboard support
- Dashboard and thread sharing
- Audit logging

For a fresh installation, the first registered user will automatically become an admin.

### 5. Start Development Server

```bash
# If other services are running in Docker
# Windows
SET OTHER_SERVICE_USING_DOCKER=true
SET EXPERIMENTAL_ENGINE_RUST_VERSION=false

# Linux/macOS
export OTHER_SERVICE_USING_DOCKER=true
export EXPERIMENTAL_ENGINE_RUST_VERSION=false

# Start the server
yarn dev
# or
npm run dev
```

Access the application at: http://localhost:3000

## Development Workflow

### Local Development with Docker Services

When developing the UI locally while other services run in Docker:

1. **Prepare environment file**
   ```bash
   cd ../docker
   cp .env.example .env.local
   ```

2. **Configure API keys**
   Edit `.env.local` and add your OpenAI API key (or other LLM provider)

3. **Start Docker services**
   ```bash
   docker-compose -f docker-compose-dev.yaml --env-file .env.local up -d
   ```

4. **Start UI from source**
   Follow the Quick Start steps above

5. **Stop Docker services**
   ```bash
   docker-compose -f docker-compose-dev.yaml --env-file .env.local down
   ```

### Developing Multiple Services

To develop UI alongside other services (e.g., AI Service):

1. Stop the specific service container
2. Start that service from source code
3. Update environment variables to point to local service

Example for AI Service:

```bash
# Stop AI service container
docker-compose -f docker-compose-dev.yaml stop analytics-ai-service

# Start AI service from source (in separate terminal)
cd ../analytics-ai-service
just start

# UI will connect to local AI service via environment variables
```

## Environment Variables

### Core Configuration

```env
# Database
DB_TYPE=sqlite                    # or 'pg' for PostgreSQL
SQLITE_FILE=./db.sqlite3         # SQLite file path
PG_URL=postgres://...            # PostgreSQL connection string

# Service Endpoints
ANALYTICS_ENGINE_ENDPOINT=http://analytics-engine:8080
ANALYTICS_AI_ENDPOINT=http://analytics-ai-service:5556
IBIS_SERVER_ENDPOINT=http://ibis-server:8000

# Features
EXPERIMENTAL_ENGINE_RUST_VERSION=false
OTHER_SERVICE_USING_DOCKER=true
```

### Authentication Configuration (Required)

```env
# JWT Secret - MUST be set for authentication to work
# Generate a secure random string: openssl rand -base64 32
JWT_SECRET=your-secure-secret-key

# OAuth Providers (Optional)
GOOGLE_OAUTH_ENABLED=false
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

GITHUB_OAUTH_ENABLED=false
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

### Docker Service Endpoints

When running other services in Docker, use these endpoints:

```env
ANALYTICS_ENGINE_ENDPOINT=http://analytics-engine:8080
ANALYTICS_AI_ENDPOINT=http://analytics-ai-service:5556
IBIS_SERVER_ENDPOINT=http://ibis-server:8000
```

When running services locally:

```env
ANALYTICS_ENGINE_ENDPOINT=http://localhost:8080
ANALYTICS_AI_ENDPOINT=http://localhost:5556
IBIS_SERVER_ENDPOINT=http://localhost:8000
```

## Project Structure

```
analytics-ui/
├── src/
│   ├── apollo/          # GraphQL client & server
│   ├── components/      # React components
│   ├── pages/          # Next.js pages
│   ├── utils/          # Utility functions
│   └── styles/         # CSS styles
├── public/             # Static assets
├── e2e/               # End-to-end tests
└── package.json       # Dependencies
```

## Available Scripts

```bash
# Development
yarn dev              # Start development server
yarn build            # Build for production
yarn start            # Start production server

# Database
yarn migrate          # Run database migrations

# Testing
yarn test             # Run unit tests
yarn test:e2e         # Run E2E tests (see e2e/README.md)

# Code Quality
yarn lint             # Run ESLint
yarn type-check       # Run TypeScript type checking
```

## Multiple Projects Support

The UI supports switching between multiple projects by using different databases:

### Example Workflow

```bash
# Project 1 (default database)
yarn migrate
yarn dev

# Switch to Project 2
export SQLITE_FILE=./project2.sqlite
yarn migrate
yarn dev

# Switch back to Project 1
export SQLITE_FILE=./db.sqlite3
yarn dev  # No migration needed

# Deploy the project in the UI to make it active
```

> **Note**: After switching databases, deploy your project in the modeling page to activate it.

## Troubleshooting

### Port 3000 Already in Use

Change the port:

```bash
# Edit package.json
"dev": "next dev -p 3001"
```

### Database Connection Issues

- **SQLite**: Ensure the file path is writable
- **PostgreSQL**: Verify connection string and database exists

### Service Connection Errors

Check that Analytics Engine and AI Service are running:

```bash
# Test endpoints
curl http://localhost:8080/health
curl http://localhost:5556/health
```

## Production Build

```bash
# Build the application
yarn build

# Start production server
yarn start
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Ant Design Components](https://ant.design/components/overview/)

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.