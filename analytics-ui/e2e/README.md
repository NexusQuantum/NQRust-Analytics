# End-to-End Testing

## Overview

This directory contains end-to-end (E2E) tests for the Analytics UI using Playwright. The tests verify the complete user workflows including data source connections, query execution, and visualization.

## Prerequisites

- **Node.js**: 18.x or higher
- **Analytics Services**: All services must be running
- **Test Data Sources**: Access to test databases (BigQuery, PostgreSQL, etc.)

## Setup

### 1. Start Analytics Services

Ensure all services are running. See [Docker README](https://github.com/NexusQuantum/NQRust-Analytics/blob/main/docker/README.md) for instructions.

```bash
cd ../docker
docker-compose --env-file .env up -d
```

### 2. Create Test Configuration

Create `e2e.config.json` in the `analytics-ui/e2e` directory:

```json
{
  "bigQuery": {
    "projectId": "your-project-id",
    "datasetId": "your-dataset-id",
    "credentialPath": ".tmp/bigquery-credentials.json"
  },
  "duckDb": {
    "sqlCsvPath": "https://duckdb.org/data/flights.csv"
  },
  "postgreSql": {
    "host": "localhost",
    "port": "5432",
    "username": "test_user",
    "password": "test_password",
    "database": "test_db",
    "ssl": false
  },
  "mysql": {
    "host": "localhost",
    "port": "3306",
    "username": "test_user",
    "password": "test_password",
    "database": "test_db"
  },
  "sqlServer": {
    "host": "localhost",
    "port": "1433",
    "username": "sa",
    "password": "YourPassword123",
    "database": "test_db"
  },
  "trino": {
    "host": "localhost",
    "port": "8081",
    "catalog": "test_catalog",
    "schema": "test_schema",
    "username": "test_user",
    "password": "test_password"
  }
}
```

> **Note**: The credential file path should be relative to the `analytics-ui` folder.

### 3. Build the UI

```bash
cd ..  # Go to analytics-ui directory
yarn build
```

> **Important**: Port 3000 must be available. The AI service requires `ANALYTICS_UI_ENDPOINT` to connect to this port for accurate test results.

## Running Tests

### Run All Tests

```bash
yarn test:e2e
```

### Run with Browser Visible

```bash
yarn test:e2e --headed
```

### Run Specific Test File

```bash
yarn test:e2e tests/connection.spec.ts
```

### Run in Debug Mode

```bash
yarn test:e2e --debug
```

## Development

### Interactive UI Mode

Write and debug tests with Playwright's interactive UI:

```bash
yarn test:e2e --ui
```

This opens a browser where you can:
- See test execution in real-time
- Step through tests
- Inspect DOM elements
- View network requests

### Generate Test Scripts

Use Playwright's code generator to create tests:

```bash
npx playwright codegen http://localhost:3000
```

This opens a browser where your actions are automatically converted to test code.

### Watch Mode

Run tests in watch mode during development:

```bash
yarn test:e2e --watch
```

## Test Structure

```
e2e/
├── tests/                 # Test files
│   ├── connection.spec.ts # Data source connection tests
│   ├── query.spec.ts     # Query execution tests
│   └── modeling.spec.ts  # MDL modeling tests
├── fixtures/             # Test fixtures and helpers
├── config.ts            # Test configuration
├── e2e.config.json      # Data source credentials
└── playwright.config.ts # Playwright configuration
```

## Writing Tests

### Example Test

```typescript
import { test, expect } from '@playwright/test';

test('connect to PostgreSQL', async ({ page }) => {
  // Navigate to connections page
  await page.goto('http://localhost:3000/connections');
  
  // Click add connection button
  await page.click('[data-testid="add-connection"]');
  
  // Select PostgreSQL
  await page.selectOption('[data-testid="datasource-type"]', 'postgres');
  
  // Fill connection details
  await page.fill('[data-testid="host"]', 'localhost');
  await page.fill('[data-testid="port"]', '5432');
  await page.fill('[data-testid="database"]', 'test_db');
  await page.fill('[data-testid="username"]', 'test_user');
  await page.fill('[data-testid="password"]', 'test_password');
  
  // Test connection
  await page.click('[data-testid="test-connection"]');
  
  // Verify success
  await expect(page.locator('[data-testid="connection-status"]'))
    .toHaveText('Connected');
});
```

### Best Practices

1. **Use Data Test IDs**: Prefer `data-testid` attributes over CSS selectors
2. **Wait for Elements**: Use Playwright's auto-waiting features
3. **Isolate Tests**: Each test should be independent
4. **Clean Up**: Reset state between tests
5. **Meaningful Names**: Use descriptive test names

## Troubleshooting

### Tests Fail to Connect to Services

Verify all services are running:

```bash
docker ps
curl http://localhost:3000/health
curl http://localhost:5556/health
curl http://localhost:8080/health
```

### Port 3000 Not Available

Ensure no other process is using port 3000:

```bash
# Windows
netstat -ano | findstr :3000

# Linux/macOS
lsof -i :3000
```

### Database Connection Failures

- Verify credentials in `e2e.config.json`
- Check database is accessible from test environment
- Ensure firewall rules allow connections

### Slow Test Execution

- Run tests in parallel: `yarn test:e2e --workers=4`
- Use headed mode only when debugging
- Optimize test data setup

## CI/CD Integration

Tests can be run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run E2E Tests
  run: |
    yarn build
    yarn test:e2e
  env:
    CI: true
```

## Reporting

Test results are saved to:
- `test-results/` - Screenshots and videos of failures
- `playwright-report/` - HTML report

View the HTML report:

```bash
npx playwright show-report
```

## Contributing

When adding new features to the UI, please add corresponding E2E tests to ensure functionality is preserved.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.
