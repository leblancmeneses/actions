- [Run Cache Action](#run-cache-action)
  - [Problems with manual caching?](#problems-with-manual-caching)
  - [Dependencies](#dependencies)
  - [Basic Usage](#basic-usage)
  - [Cache Key Strategy](#cache-key-strategy)
  - [Branch Access Patterns](#branch-access-patterns)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Examples](#examples)

# Run Cache Action

The Run Cache Action provides simple command execution caching using Google Cloud Storage. When a cache marker exists for a given cache path, the command is **skipped entirely**. When no cache exists, the command executes normally and creates a cache marker on successful completion (exit code 0).

This action is designed to solve the complexity of manual caching in GitHub Actions workflows, particularly for:
- Long-running test suites that don't need to re-run if nothing changed
- Build processes that produce the same artifacts
- Setup steps that are expensive to repeat
- Any deterministic command that can be safely skipped

**Key Behavior:**
- ✅ Cache hit → Skip command execution entirely, return immediately
- ❌ No cache → Execute command, create cache marker if successful (exit code 0)
- ❌ Command fails → No cache marker created, normal failure behavior

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
| `exit-code` | `"0"` if cache hit, actual exit code if command executed |

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
      echo "Tests executed with exit code: ${{ steps.tests.outputs.exit-code }}"
      if [ "${{ steps.tests.outputs.exit-code }}" != "0" ]; then
        echo "Tests failed!"
        exit 1
      fi
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

## Best Practices

1. **Cache Key Design**: Include all factors that affect command outcome
2. **Granularity**: Cache at appropriate levels - not too broad, not too narrow
3. **Branch Strategy**: Use branch-specific caches for branch-specific work
4. **Shared Caches**: Use content-based keys for caches that can be shared across branches
5. **GCS Organization**: Structure your GCS paths logically (`gs://bucket/project/type/key`)
6. **Permissions**: Ensure your GCS service account has read/write access to cache buckets
7. **Monitoring**: Track cache hit rates to optimize your caching strategy

## Troubleshooting

- **Commands always execute**: Check `cache-path` format and GCS permissions
- **Permission denied**: Verify `GOOGLE_APPLICATION_CREDENTIALS` and GCS bucket access
- **Cache not created**: Ensure commands exit with code 0 on success
- **Unexpected cache misses**: Verify cache keys are deterministic and consistent

## Differences from GitHub Actions Cache

| Feature | GitHub Actions Cache | GCS Run Cache |
|---------|---------------------|---------------|
| **Branch Access** | Restricted (PR→main only) | Flexible (any→any) |
| **Cache Content** | Files/directories | Simple existence marker |
| **Cache Size** | Limited per cache entry | Minimal (just marker files) |
| **Cross-repo** | Not supported | Possible with shared GCS |
| **TTL** | Automatic (7 days) | Manual via cache key design |
| **Setup** | Built-in | Requires GCS setup |