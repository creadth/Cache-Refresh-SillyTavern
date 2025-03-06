# SillyTavern Cache Refresher Extension

## The Problem

When using AI language models like OpenAI's GPT or similar services, these platforms typically implement a caching mechanism to improve performance and reduce costs. When you send a prompt that has been processed recently, the service can return the cached response instead of processing the entire prompt again.

However, these caches have a limited lifetime - typically around 5 minutes. After this period, the cache expires and subsequent requests with the same prompt will be processed as new, incurring full token costs.

This creates a significant issue for users:
- If you're working with the same context/prompt repeatedly, you want to take advantage of the cache to save costs
- But if you wait too long between requests (>5 minutes), the cache expires and you pay full price again
- This is especially problematic during longer sessions where you might pause your work

## The Solution

The Cache Refresher extension solves this problem by automatically sending minimal "ping" requests to keep the cache warm. Here's how it works:

1. After a successful generation, the extension captures the prompt data
2. It schedules background refreshes at intervals just under the cache expiration time (default: 4 minutes 55 seconds)
3. These refreshes request only 1 token, minimizing API costs while keeping the full prompt cached
4. You can configure how many refreshes to perform and the refresh interval

## Benefits

- Significantly reduces API costs for repeated or similar prompts
- Works automatically in the background
- Configurable to match your workflow
- Visual indicators show when cache refreshing is active

## How to Use

1. Enable the extension using the "Enable Cache Refreshing" button in the extensions menu
2. Configure settings (refresh interval and maximum refreshes) by clicking the "Cache Refresher Settings" button
3. Use SillyTavern normally - the extension will automatically manage cache refreshing in the background
4. A spinning icon indicates when cache refreshing is active

## Technical Details

This extension is inspired by the cache warming technique used in the Aider project, which implements a similar mechanism to keep LLM caches warm during coding sessions.
