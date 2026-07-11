---
name: Discord selfbot sendSlash USER options
description: Why passing a username (not a snowflake) to discord.js-selfbot-v13's sendSlash for a USER-type option fails silently/asynchronously.
---

`discord.js-selfbot-v13`'s `TextBasedChannel#sendSlash` does not resolve usernames/mentions
to IDs for USER (type 6) command options — it passes the raw value straight through to
Discord's interactions API. If you pass a plain username, Discord rejects the interaction
with `Value "<name>" is not snowflake`.

**Why it's easy to miss:** internally, `sendSlash` calls `this.client.api.interactions.post(...)`
without awaiting it — a fire-and-forget request. The `Value "<name>" is not snowflake`
rejection from that call becomes an unhandled promise rejection, not something the caller's
`try/catch` around `await channel.sendSlash(...)` can catch. Code built assuming errors
surface through the awaited call will wrongly report success (e.g. "transfer complete, 0 sent")
while the interaction silently failed on Discord's side.

**How to apply:** before calling `sendSlash` (or building any interaction payload) with a
USER-type option, resolve the value to an actual numeric Discord user ID yourself — via
`guild.members.fetch({ query, limit })`/`guild.members.cache`, or require the caller to supply
a snowflake/mention directly. Validate with `/^\d{17,20}$/` and throw a clear, synchronous,
catchable error if resolution fails, rather than letting a malformed value reach the API call.
