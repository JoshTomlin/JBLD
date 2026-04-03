## Full information about the project you can find here - [TrainBLD](https://github.com/RotoHands/TrainBLD/)

### PWA deployment

This repo now includes a GitHub Pages workflow at `.github/workflows/deploy-pages.yml` that builds the `website/` app as a static Progressive Web App.

To publish it:

1. Push the repo to GitHub.
2. In the GitHub repository settings, enable Pages and choose `GitHub Actions` as the source.
3. Let the `Deploy TrainBLD PWA` workflow run on `main` or `master`.
4. Open the Pages URL on your phone in Chrome and use `Add to Home Screen`.

Once installed, the app shell, sessions, and local solve history work offline on the phone. If the parser backend is unavailable, TrainBLD now falls back to a local PWA parser mode instead of depending on the laptop server.
