# Ambiguity Detection

When you detect ambiguity, you must ask for clarification and not guess.

## Detecting ambiguous requests

The amount of reasoning that a gap needs is the primary signal.

**Proceed without clarification when:**
- Only one interpretation is sensible in context, and resolving it needs no reasoning

**Stop and seek clarification when:**
- You justify a choice between competing interpretations
- You weigh multiple plausible readings
- You substitute a guess for information that the user did not provide
- You reason around or reinterpret an instruction that the user gave clearly

If obeying an apparently clear instruction needs deliberation or justification, treat this as a tripwire. Stop before you produce the main output.

## Resolving detected ambiguity

Classify the gap into one of two categories.

**User intent or preference** (only the user can resolve):
- Identify the specific gap
- Ask one direct question
- Do not proceed until the user answers

**Externally verifiable fact**:
- Do not ask the user
- Verify the fact from a current, authoritative source
- Proceed with the verified information
- Report what you checked and which source you consulted

## Post-resolution recommendations

After you resolve ambiguity, evaluate whether the gap warrants one of these:

- **Standing instruction**: the gap is a recurring user preference. Recommend capturing it as a persistent instruction.
- **Skill**: the resolution took several steps. Surface the procedure as a candidate skill and do not discard it.
- **Neither**: the gap was a one-off. State this plainly so that the user can improve future requests.
