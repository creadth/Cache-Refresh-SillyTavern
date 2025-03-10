# SillyTavern Cache Refresher Extension

[![Status](https://img.shields.io/badge/status-beta-yellow.svg)]()

This extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern) automatically keeps your language model's cache "warm" by sending periodic, minimal requests. While designed primarily for Claude Sonnet, it works with other models as well. By preventing cache expiration, you can significantly reduce API costs.

## The Problem: Cache Expiration

AI language models (LLMs) like Claude (through OpenRouter), OpenAI's GPT, and others use caching to improve performance and reduce costs. When you send a prompt that's similar to a recent one, or enable caching on your prompts, the service can often return a cached response instead of recomputing everything, resulting in a cache discount (90% reduction of the cached input price for Claude).

However, these caches typically have a short lifespan (often just a few minutes). If you pause your interaction with the model longer than the cache timeout, the cache expires, and your next request incurs the full cost. Additionally, enabling caching itself may have costs for some models (Claude charges 1.25x the original input price for caching).

Price comparaison with Sonnet (middle of a conversation): 
-  no caching [(4091 prompt, 0.012273$) + (414 completion, 0.00621$) = 0.0185$, 100% price]
-  caching at depth 2 + system prompt caching [(4091 prompt, 0.00379$)  -> (414 completion, 0.00621$) = 0.01$, 54% price]
-  cache refresh of the above cash [(4091 prompt, 0.00254$) -> (2 completion, 0.00003$) = 0.00254$, 14% price] (prompt price is lower because of the caching charge of 1.25)

not caching will make you pay 1.85 times more on 4000 tokens (which only get worst as the number of token increases).
Refreshing the cache cost only 0.14 time than restarting the prompt without cache (not counting the caching charge).
Therefor if you had already had cached your prompt prior, it would have been rentable to refresh at least 3 times in this cases. (noCaching - Caching) / Refresh = (0.02 - 0.011) / 0.003 = 3 refresh

## The Solution: Cache Refreshing

This extension solves this problem by:

1.  **Capturing Prompts:** After each successful generation, the extension captures the prompt sent to the AI model.
2.  **Scheduling Refreshes:** It then schedules periodic "ping" requests to the API. These requests are designed to be minimal (requesting only a single token) to keep the cache alive while minimizing costs.
3.  **Configurable Settings:** You can customize:
    *   **Refresh Interval:** How often to send refresh requests (default: 4 minutes 30 seconds, optimized for typical cache lifetimes).
    *   **Maximum Refreshes:** The maximum number of refresh requests to send before stopping (default: 3).
    *   **Minimum Tokens:** The number of tokens to request in each refresh (default: 1).
    *   **Show Notifications:** Toggle visibility of toast notifications for each refresh.
    *   **Show Status Indicator:** Toggle the floating status indicator that displays refresh countdown.

## Benefits

*   **Reduced API Costs:** Avoid paying full price when your typing or response time exceeds the cache timeout.
*   **Automated:** Works silently in the background without requiring manual intervention.
*   **OpenRouter/Claude Optimized:** While compatible with various models, it's particularly beneficial for OpenRouter's Claude Sonnet, which has a short cache lifetime.

## Installation

1.  **Prerequisites:** You must have SillyTavern installed and running.
2.  **Install the Extension:** In SillyTavern, go to the Extensions menu (the puzzle piece icon). Click the "Install extension" button and enter: https://github.com/OneinfinityN7/Cache-Refresh-SillyTavern
3.  **Enable the Extension:** In the Extensions menu, you'll find a new "Cache Refresher" panel containing all the extension's options.

## Usage

Once enabled, the extension works automatically in the background. If you've enabled the status indicator, you'll see a display in the bottom right corner showing the number of remaining refreshes and a countdown timer. With notifications enabled, you'll also receive toast messages each time the cache is refreshed.

## Technical Details

*   **Dependencies:** This extension relies on SillyTavern's core functionality, including its event system, API request handling, and settings management. It also uses jQuery (which is included with SillyTavern) and standard browser APIs.
*   **Event-Driven:** The extension listens for SillyTavern events to capture prompts and trigger refresh cycles.
    *   Listens for `CHAT_COMPLETION_PROMPT_READY` events to capture prompts.
    *   Listens for `MESSAGE_RECEIVED` to start the refresh cycle.
    *   Listens for `CHAT_CHANGED` events to stop the refresh cycle and clear data when the user switches chats.
*   **API Requests:** The extension uses SillyTavern's built-in `sendGenerationRequest` function to send the refresh requests. This ensures that the correct API endpoint, authentication, and settings are used.
*   **Settings:** Settings are stored using SillyTavern's `extension_settings` object, making them persistent across sessions.
*   **UI Integration:** The extension adds a settings panel to SillyTavern's extensions menu and a floating status indicator.

## How It Works

1.  When you send a message and receive a response, the extension captures the prompt data.
2.  It then schedules a series of refresh requests (up to the maximum number configured), if a prompt has been captured.
3.  Each refresh request sends a minimal request to the API to keep the cache alive.
4.  A floating status indicator shows the number of remaining refreshes and a countdown timer.
5.  When the maximum number of refreshes is reached, or no prompt is available, the cycle stops until you send another message and a response is received.

## Troubleshooting

*   **Extension Not Appearing:** Ensure you've installed the extension correctly and restarted SillyTavern.
*   **No Notifications:** Verify that "Show Notifications" is enabled in the extension's settings.

*   **No Cache Reduction:**
    *   Confirm that the model you're using supports cache reduction.
    *   For Claude: Ensure you've activated caching in the config.yaml file. The relevant options are `enableSystemPromptCache` and `cachingAtDepth`. 
      * For optimal caching, it's recommended to only enable `cachingAtDepth` and set it to an even number.
      * The number represents caching depth: 0 is your most recent message (typically {{user}} - not recommended), 2 represents the two previous messages (usually sufficient).
      * If you enable `enableSystemPromptCache`, ensure your system prompt doesn't contain any random elements.
*   **Cache Still Expiring:**
    *   Verify the extension is enabled.
    *   Ensure the refresh interval is *shorter* than your API/model's cache lifetime.
    *   Use SillyTavern's API panel to compare the extension's refreshed prompts with the original prompts.
    *   Check the browser's developer console (F12) for any error messages.

## Contributing

Contributions are welcome! If you find a bug or have a feature request, please open an issue on this GitHub repository. If you'd like to contribute code, please fork the repository and submit a pull request.

## License

This extension is released under the [MIT License](LICENSE).
