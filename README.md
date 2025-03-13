# SillyTavern Cache Refresher Extension

[![Status](https://img.shields.io/badge/status-ready-green.svg)]()

This extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern) automatically keeps your language model's cache "warm" by sending periodic, minimal requests. While designed primarily for Claude Sonnet, it works with other models as well. By preventing cache expiration, you can significantly reduce API costs.

## The Problem: Cache Expiration

AI language models (LLMs) like Claude (through OpenRouter), OpenAI's GPT, and others use caching to improve performance and reduce costs. When you send a prompt that's similar to a recent one, or enable caching on your prompts, the service can often return a cached response instead of recomputing everything, resulting in a cache discount (90% reduction of the cached input price for Claude).

However, these caches typically have a short lifespan (often just a few minutes). If you pause your interaction with the model longer than the cache timeout, the cache expires, and your next request incurs the full cost. Additionally, enabling caching itself may have costs for some models (Claude charges 1.25x the original input price for caching).

## The Solution: Cache Refreshing

*   When you send a message and receive a response, the extension captures the prompt data.
*   It then schedules a series of refresh requests (up to the maximum number configured).
*   If a new message is sent, the refresh timer will stop and then restart after the new response is received.
*   Each refresh request sends a minimal request to the API to just to keep the cache alive.
*   A floating status indicator shows the number of remaining refreshes and a countdown timer, and a notification appear after each succesful refresh.
*   If you change or leave the conversation, the timer will stop.

### OpenRouter Logs Analysis

#### Price Comparison with Claude Sonnet 3.7 (4000 tokens, 12 messages)

| Caching Method | Prompt Tokens | Completion Tokens | Total Cost | % of Base Price |
|----------------|---------------|-------------------|------------|-----------------|
| No caching | 4091 ($0.012273) | 414 ($0.00621) | $0.0185 | 100% |
| Depth 2 + System | 4091 ($0.00379) | 414 ($0.00621) | $0.01 | 54% |
| Cache refresh | 4091 ($0.00254) | 2 ($0.00003) | $0.00257 | 14% |

#### Price Comparison with Claude Sonnet 3.7 (14000 tokens, 76 messages)

| Caching Method | Prompt Tokens | Completion Tokens | Total Cost | % of Base Price |
|----------------|---------------|-------------------|------------|-----------------|
| No caching | 14412 ($0.04323) | 298 ($0.00447) | $0.0477 | 100% |
| Depth 2 + System | 14412 ($0.00653) | 298 ($0.00447) | $0.011 | 23% |
| Cache refresh | 14412 ($0.00541) | 2 ($0.00003) | $0.00544 | 11% |

## Installation

1.  **Prerequisites:** You must have SillyTavern installed and running.
2.  **Install the Extension:** In SillyTavern, go to the Extensions menu (the puzzle piece icon). Click the "Install extension" button (top right) and enter: https://github.com/OneinfinityN7/Cache-Refresh-SillyTavern
3.  **Enable the Extension:** In the Extensions menu, you'll find a new "Cache Refresher" panel containing all the extension's options.

## Troubleshooting

*   **Extension Not Appearing:** Ensure you've installed the extension correctly and restarted SillyTavern.
*   **No Notifications:** Check that "Show Notifications" is enabled in the extension settings. If notifications are still not appearing, you may need to modify the HTML template yourself to ensure proper display.

*   **No Cache Reduction:**
    *   Confirm that the model you're using supports cache reduction.
    *   For Claude: Ensure you've activated caching in the config.yaml file. The relevant options are `enableSystemPromptCache` and `cachingAtDepth`. 
      * For optimal caching, it's recommended to only enable `cachingAtDepth` and set it to an even number.
      * The number represents caching depth: 0 is your most recent message (not recommended), 2 represents the two previous messages before (usually sufficient).
      * If you enable `enableSystemPromptCache`, ensure your system prompt doesn't contain any random elements.
      * For more details on Claude caching, see: https://rentry.org/pay-the-piper-less
*   **Cache Still Expiring:**
    *   Verify the extension is enabled.
    *   Ensure the refresh interval is *shorter* than your API/model's cache lifetime.
    *   Use SillyTavern's API panel to compare the extension's refreshed prompts with the original prompts.
    *   Check the browser's developer console (F12) for any error messages.

## License

This extension is released under the [MIT License](LICENSE).
