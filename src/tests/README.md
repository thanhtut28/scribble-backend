# Testing Strategy for Scribble Game

This document outlines the testing approach used for the Scribble Game backend project.

## Testing Framework

We use Jest as our primary testing framework due to its excellent integration with NestJS and TypeScript. Jest provides:

- Fast, parallel test execution
- Built-in assertion library
- Mocking capabilities
- Code coverage reporting
- Watch mode for development

## Types of Tests

### Unit Tests

These tests focus on individual functions and classes in isolation. Dependencies are mocked to ensure we're only testing the specific unit of code.

Key areas covered by unit tests:

- Service methods (game logic, room management)
- Utility functions
- Validation logic

### Integration Tests

These tests verify that different components work together correctly. We test:

- Service-to-database interactions
- Gateway-to-service communications
- Event handling chains

### WebSocket Tests

Specific tests for WebSocket functionality, including:

- Connection handling
- Event emission and reception
- Room joining/leaving logic
- Real-time updates

## Test Coverage

We aim for high test coverage on critical components:

- Game logic (scoring, turn management)
- Room management (creation, joining, validation)
- WebSocket event handling

## Running Tests

### Basic Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (good for development)
npm test -- --watch

# Run tests with coverage report
npm test -- --coverage

# Run specific test file
npm test -- src/game/tests/game.service.spec.ts
```

Or use the provided script:

```bash
# Make the script executable first
chmod +x run-tests.sh

# Run the script
./run-tests.sh
```

### Test Structure

Each test file follows a similar structure:

1. Imports and mock setup
2. Test suite definition with `describe`
3. Test initialization with `beforeEach`
4. Individual test cases with `it`

Example:

```typescript
describe('GameService', () => {
  let service: GameService;

  beforeEach(async () => {
    // Setup test module
  });

  it('should process a correct guess', async () => {
    // Test logic here
  });
});
```

## Adding New Tests

When adding new features, follow these guidelines:

1. Create a corresponding test file in the appropriate `tests` directory
2. Mock all external dependencies
3. Test both successful operations and error cases
4. Verify both function outputs and side effects (e.g., database calls)

## Test Data

We use mock data rather than accessing the actual database. This ensures:

- Tests run quickly
- Tests are isolated and repeatable
- No risk of corrupting real data

## Continuous Integration

Tests are automatically run as part of our CI pipeline when:

- Pull requests are created
- Code is merged to main
- Release tags are created
