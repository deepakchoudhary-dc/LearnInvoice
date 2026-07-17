# Contributing to Ultimate Smart Invoice Generator

We welcome contributions from traders, small business owners, and developers to make this the best offline-first billing application.

## Principles
1. **Offline-first**: No feature should require internet access to function.
2. **Privacy**: All data must remain local. No analytics, tracking, or cloud sync.
3. **Financial Integrity**: All monetary calculations must use integer minor units (Paise) to avoid floating-point errors.
4. **No heavy dependencies**: Stick to vanilla JavaScript, HTML, and CSS wherever possible.

## Development Setup
1. Clone the repository.
2. Run `npm install` (only for the local dev server).
3. Run `npm run start` to start the app.
4. Run `npm run test` to execute the local test suite.

## Pull Requests
- Ensure all tests pass.
- Maintain the strict Content Security Policy.
- Do not introduce external CDN dependencies (fonts, libraries).
