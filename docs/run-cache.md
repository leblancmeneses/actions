- [Run Cache Action](#run-cache-action)
  - [Overview](#overview)
  - [Problems with manual caching?](#problems-with-manual-caching)
  - [Dependencies](#dependencies)
  - [Basic Usage](#basic-usage)
  - [Cache Key Strategy](#cache-key-strategy)
  - [Branch Access Patterns](#branch-access-patterns)
  - [Inputs](#inputs)
    - [Shell Options](#shell-options)
  - [Outputs](#outputs)
  - [Include Stdout Feature](#include-stdout-feature)
    - [Example with State Management](#example-with-state-management)
  - [Examples](#examples)
    - [Basic Test Caching](#basic-test-caching)
    - [Build Process with Branch-Specific Caching](#build-process-with-branch-specific-caching)
    - [Multi-step Setup with Shared Cache](#multi-step-setup-with-shared-cache)
    - [Conditional Execution Based on Cache](#conditional-execution-based-on-cache)
    - [Cross-Platform Build Caching](#cross-platform-build-caching)
    - [Python Environment Setup](#python-environment-setup)
    - [Long-running Tests with Different Cache Granularity](#long-running-tests-with-different-cache-granularity)
    - [Test Results with stdout Caching](#test-results-with-stdout-caching)
    - [Dependency Information Caching](#dependency-information-caching)

# Run Cache Action

## Overview

The Run Cache Action provides simple command execution caching using Google Cloud Storage. When a cache marker exists for a given cache path, the command is **skipped entirely**. When no cache exists, the command executes normally and creates a cache marker on successful completion (exit code 0).

This action is designed to solve the complexity of manual caching in GitHub Actions workflows, particularly for:
- Long-running test suites that don't need to re-run if nothing changed
- Build processes that produce the same artifacts
- Setup steps that are expensive to repeat
- Any deterministic command that can be safely skipped
- State management and data persistence across workflow steps

**Key Behavior:**
- ✅ Cache hit → Skip command execution entirely, return immediately
- ❌ No cache → Execute command, create cache marker if successful (exit code 0)
- ❌ Command fails → No cache marker created, normal failure behavior
- 📤 Optional stdout caching → Store and retrieve command output for state management

## Problems with manual caching?

Here's the typical manual approach to command caching in GitHub Actions:

```yaml
steps:
  - name: Check if work already done
    id: cache-check
    run: |
      if gsutil -q stat "gs://my-bucket/cache/tests-${{ hashFiles('**/*.test.js') }}"; then
        echo "cache_hit=true" >> $GITHUB_OUTPUT
      else
        echo "cache_hit=false" >> $GITHUB_OUTPUT
      fi

  - name: Run expensive tests
    if: steps.cache-check.outputs.cache_hit != 'true'
    run: npm test

  - name: Mark work as done
    if: steps.cache-check.outputs.cache_hit != 'true' && success()
    run: |
      echo "completed at $(date)" | gsutil cp - "gs://my-bucket/cache/tests-${{ hashFiles('**/*.test.js') }}"
```

This manual approach requires:
- Multiple steps with complex conditionals
- Manual cache key generation and management
- Error-prone success/failure handling
- Repetitive boilerplate for every cached operation
- Easy to forget the caching logic

## Dependencies

- **Google Cloud Storage**: Cache markers stored in GCS
- **GOOGLE_APPLICATION_CREDENTIALS**: Environment variable with service account credentials
- **@actions/core**: GitHub Actions integration
- **@actions/exec**: Command execution


## Basic Usage

```yaml
- name: Run tests with caching
  uses: ./apps/run-cache
  with:
    run: 'npm test'
    cache-path: 'gs://my-bucket/test-cache/${{ hashFiles("**/*.test.js", "src/**/*.js") }}'
```

## Cache Key Strategy

The `cache-path` should include factors that affect the command outcome:

```yaml
# Content-based cache key
cache-path: 'gs://bucket/tests/${{ hashFiles("src/**", "test/**") }}'

# Multi-factor cache key
cache-path: 'gs://bucket/build/${{ runner.os }}-${{ hashFiles("package*.json") }}-${{ hashFiles("src/**") }}'

# Branch-specific cache
cache-path: 'gs://bucket/lint/${{ github.ref_name }}-${{ hashFiles("**/*.js") }}'
```

## Branch Access Patterns

Unlike GitHub Actions cache which has complex branch access rules, GCS-based caching allows flexible cross-branch access:

**GitHub Actions Cache Limitations:**
- PR branches can only access caches from the base branch (usually `main`)
- PR branches cannot access caches from other PRs
- Caches created in PRs are not accessible to `main` branch

**GCS Cache Benefits:**
- Any branch can access any cache (based on your GCS permissions)
- PR branches can access caches from other PRs
- Caches created in PRs can be accessed by `main` branch
- Full control over cache sharing via GCS bucket policies

**Recommended Patterns:**

```yaml
# Shared cache across all branches
cache-path: 'gs://bucket/shared/tests-${{ hashFiles("**/*.test.js") }}'

# Branch-specific cache
cache-path: 'gs://bucket/branch/${{ github.ref_name }}/build-${{ hashFiles("src/**") }}'

# PR-specific but accessible to main
cache-path: 'gs://bucket/pr/${{ github.event.number || github.ref_name }}/tests-${{ hashFiles("**") }}'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `run` | Command(s) to execute | Yes | - |
| `shell` | Shell to use for execution | No | `bash` |
| `working-directory` | Working directory for command | No | `.` |
| `cache-path` | GCS path for cache marker | Yes | - |
| `include-stdout` | Include stdout in cache and return as output | No | `false` |

### Shell Options

- `bash` - Uses `bash -c "command"`
- `sh` - Uses `sh -c "command"`
- `pwsh` / `powershell` - Uses `pwsh -Command "command"`
- `python` - Uses `python -c "command"`
- `node` - Uses `node -e "command"`

## Outputs

| Output | Description |
|--------|-------------|
| `cache-hit` | `"true"` if cache found and command skipped, `"false"` if command executed |
| `stdout` | Command stdout (only when `include-stdout=true`) |

## Include Stdout Feature

When `include-stdout` is set to `true`, the action will:
- Cache the command's stdout along with the success marker
- Return the cached stdout on cache hits via the `stdout` output
- Allow you to use the action for state management and data persistence

This is particularly useful for:
- Commands that generate build information or metadata
- State that needs to be passed between workflow steps
- JSON output that other steps need to consume

### Example with State Management

```yaml
- name: Generate build metadata
  id: metadata
  uses: ./apps/run-cache
  with:
    run: |
      echo '{
        "version": "'$(npm version --json | jq -r .version)'",
        "buildTime": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
        "commit": "'${GITHUB_SHA}'",
        "artifacts": ["dist/app.js", "dist/app.css"]
      }'
    include-stdout: 'true'
    cache-path: 'gs://build-cache/metadata/${{ hashFiles('package*.json', 'src/**') }}'

- name: Use build metadata
  run: |
    metadata='${{ steps.metadata.outputs.stdout }}'
    version=$(echo "$metadata" | jq -r .version)
    echo "Building version: $version"

    # Parse artifacts list
    echo "$metadata" | jq -r '.artifacts[]' | while read artifact; do
      echo "Artifact: $artifact"
    done
```

## Examples

### Basic Test Caching

```yaml
- name: Run unit tests
  id: tests
  uses: ./apps/run-cache
  with:
    run: 'npm test'
    cache-path: 'gs://ci-cache/unit-tests/${{ hashFiles("src/**/*.js", "test/**/*.js") }}'

- name: Check results
  run: |
    if [ "${{ steps.tests.outputs.cache-hit }}" = "true" ]; then
      echo "Tests were skipped due to cache hit"
    else
      echo "Tests were executed"
    fi
```

### Build Process with Branch-Specific Caching

```yaml
- name: Build application
  uses: ./apps/run-cache
  with:
    run: |
      echo "Installing dependencies..."
      npm ci
      echo "Building application..."
      npm run build
    cache-path: 'gs://build-cache/${{ github.ref_name }}/build-${{ hashFiles("package*.json", "src/**") }}'
```

### Multi-step Setup with Shared Cache

```yaml
- name: Setup development environment
  uses: ./apps/run-cache
  with:
    run: |
      # Install system dependencies
      sudo apt-get update
      sudo apt-get install -y build-essential python3-dev

      # Setup Python environment
      python -m venv .venv
      source .venv/bin/activate
      pip install -r requirements.txt

      # Run initial setup
      python setup.py develop
    cache-path: 'gs://setup-cache/dev-env/${{ runner.os }}-${{ hashFiles("requirements.txt", "setup.py") }}'
```

### Conditional Execution Based on Cache

```yaml
- name: Expensive operation
  id: operation
  uses: ./apps/run-cache
  with:
    run: './scripts/expensive-task.sh'
    cache-path: 'gs://task-cache/expensive-${{ github.sha }}'

- name: Only run if work was actually done
  if: steps.operation.outputs.cache-hit == 'false'
  run: |
    echo "Expensive operation completed, doing follow-up work..."
    ./scripts/post-process.sh

- name: Always run regardless of cache
  run: |
    echo "This always runs, cache-hit: ${{ steps.operation.outputs.cache-hit }}"
```

### Cross-Platform Build Caching

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]

steps:
  - name: Build for platform
    uses: ./apps/run-cache
    with:
      run: |
        npm ci
        npm run build:${{ runner.os }}
        npm run test:integration
      cache-path: 'gs://build-cache/platform/${{ matrix.os }}-${{ hashFiles("**") }}'
```

### Python Environment Setup

```yaml
- name: Setup Python environment
  uses: ./apps/run-cache
  with:
    run: |
      python -m pip install --upgrade pip
      pip install -r requirements.txt
      pip install -r requirements-dev.txt
    shell: 'python'
    cache-path: 'gs://python-cache/env-${{ hashFiles("requirements*.txt") }}'
```

### Long-running Tests with Different Cache Granularity

```yaml
# Fine-grained caching per test suite
- name: Unit tests
  uses: ./apps/run-cache
  with:
    run: 'npm run test:unit'
    cache-path: 'gs://test-cache/unit-${{ hashFiles("src/**", "test/unit/**") }}'

- name: Integration tests
  uses: ./apps/run-cache
  with:
    run: 'npm run test:integration'
    cache-path: 'gs://test-cache/integration-${{ hashFiles("src/**", "test/integration/**") }}'

- name: E2E tests
  uses: ./apps/run-cache
  with:
    run: 'npm run test:e2e'
    cache-path: 'gs://test-cache/e2e-${{ hashFiles("src/**", "test/e2e/**") }}'
```

### Test Results with stdout Caching

```yaml
- name: Run tests with result caching
  id: tests
  uses: ./apps/run-cache
  with:
    run: |
      npm test -- --reporter=json > test-results.json
      cat test-results.json
    include-stdout: 'true'
    cache-path: 'gs://test-cache/results-${{ hashFiles("src/**", "test/**") }}'

- name: Process test results
  run: |
    results='${{ steps.tests.outputs.stdout }}'
    passed=$(echo "$results" | jq '.stats.passes')
    failed=$(echo "$results" | jq '.stats.failures')

    echo "Tests passed: $passed"
    echo "Tests failed: $failed"

    if [ "$failed" -gt 0 ]; then
      echo "Some tests failed, checking details..."
      echo "$results" | jq '.failures[]'
    fi
```

### Dependency Information Caching

```yaml
- name: Get dependency info
  id: deps
  uses: ./apps/run-cache
  with:
    run: |
      echo '{
        "nodeVersion": "'$(node --version)'",
        "npmVersion": "'$(npm --version)'",
        "packageCount": '$(npm list --depth=0 --json | jq '.dependencies | length')',
        "devPackageCount": '$(npm list --depth=0 --json | jq '.devDependencies | length')'
      }'
    include-stdout: 'true'
    cache-path: 'gs://build-cache/deps-${{ hashFiles("package*.json") }}'

- name: Report dependency info
  run: |
    deps='${{ steps.deps.outputs.stdout }}'
    echo "Node: $(echo "$deps" | jq -r .nodeVersion)"
    echo "NPM: $(echo "$deps" | jq -r .npmVersion)"
    echo "Dependencies: $(echo "$deps" | jq -r .packageCount)"
    echo "Dev Dependencies: $(echo "$deps" | jq -r .devPackageCount)"
```