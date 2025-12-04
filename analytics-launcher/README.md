# Analytics Launcher

## Overview

Analytics Launcher is a command-line tool written in Go that simplifies the deployment and management of NQRust-Analytics services. It provides an interactive interface for starting, stopping, and configuring the analytics platform.

## Features

- **Interactive Setup**: Guided configuration wizard
- **Docker Integration**: Automated Docker Compose management
- **Configuration Management**: Easy LLM provider setup
- **DBT Integration**: Convert DBT models to Analytics MDL format

## Prerequisites

- **Go**: 1.24 or higher
- **Docker**: For running analytics services
- **Docker Compose**: V2 recommended

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/NexusQuantum/NQRust-Analytics.git
cd NQRust-Analytics/analytics-launcher

# Build the launcher
go build -o analytics-launcher

# Run the launcher
./analytics-launcher
```

### Using Go Install

```bash
go install github.com/NexusQuantum/NQRust-Analytics/analytics-launcher@latest
```

## Usage

### Launch Analytics Platform

```bash
./analytics-launcher launch
```

This will:
1. Check Docker installation
2. Download required configuration files
3. Guide you through LLM provider setup
4. Start all analytics services
5. Open the UI in your browser

### DBT Model Conversion

Convert DBT models to Analytics MDL format:

```bash
./analytics-launcher dbt convert \
  --manifest path/to/manifest.json \
  --catalog path/to/catalog.json \
  --output output_directory
```

#### Options

- `--manifest`: Path to DBT manifest.json file (required)
- `--catalog`: Path to DBT catalog.json file (required)
- `--output`: Output directory for MDL files (default: current directory)
- `--project-name`: Custom project name (default: from manifest)

#### Example

```bash
# Convert DBT project to MDL
./analytics-launcher dbt convert \
  --manifest ./dbt_project/target/manifest.json \
  --catalog ./dbt_project/target/catalog.json \
  --output ./mdl_models \
  --project-name my_analytics_project
```

The converter will:
- Parse DBT manifest and catalog files
- Generate MDL model definitions
- Create relationship mappings
- Output structured MDL JSON files

## Development

### Project Structure

```
analytics-launcher/
├── commands/          # CLI commands
│   ├── launch.go     # Launch command
│   └── dbt/          # DBT conversion
├── config/           # Configuration management
├── utils/            # Utility functions
│   └── docker.go    # Docker operations
├── main.go          # Entry point
└── go.mod           # Dependencies
```

### Building

```bash
# Build for current platform
go build -o analytics-launcher

# Build for specific platform
GOOS=linux GOARCH=amd64 go build -o analytics-launcher-linux
GOOS=darwin GOARCH=amd64 go build -o analytics-launcher-mac
GOOS=windows GOARCH=amd64 go build -o analytics-launcher.exe
```

### Testing

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run specific test
go test ./commands/dbt/...
```

### Code Quality

```bash
# Run linter
golangci-lint run

# Format code
go fmt ./...

# Vet code
go vet ./...
```

## CI/CD

The project uses GitHub Actions for continuous integration:

- **Build**: Compiles for multiple platforms
- **Test**: Runs unit tests
- **Lint**: Code quality checks with golangci-lint
- **Security**: Gosec security scanner

See [.github/workflows/analytics-launcher-ci.yaml](../.github/workflows/analytics-launcher-ci.yaml) for details.

## Configuration

The launcher uses the following configuration sources:

1. **Environment Variables**: For sensitive data (API keys)
2. **Config Files**: Downloaded from GitHub releases
3. **Interactive Prompts**: For user-specific settings

### Configuration Files

- `docker-compose.yaml`: Service definitions
- `.env`: Environment variables
- `config.yaml`: AI service configuration

These are automatically downloaded from:
```
https://raw.githubusercontent.com/NexusQuantum/NQRust-Analytics/{version}/docker/
```

## Troubleshooting

### Docker Not Found

Ensure Docker is installed and running:

```bash
docker --version
docker-compose --version
```

### Port Conflicts

If ports are already in use, modify the `.env` file:

```env
HOST_PORT=8080  # Change from default 3000
```

### Configuration Download Fails

Check your internet connection and GitHub access. You can manually download configuration files from the repository.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

## License

See [LICENSE](../LICENSE) for details.
