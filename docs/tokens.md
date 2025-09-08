# Tokens & Budgets

AICP counts tokens with `@dqbd/tiktoken`.

## Model & encoding
- Default encoding: `o200k_base` (good for modern GPT‑4.x/4o/1.x).
- For older GPT‑3.5/4 families, use `--encoding cl100k_base`.
- You can also set `--model` to let AICP infer a sensible encoding.

## Estimates vs strict
- Selection is done by estimated per‑file tokens plus wrapper overhead.
- With `--strict` (default), AICP re‑renders the final text and trims from the end to fit `--max-tokens`.

## Tips
- Switch `--pack-order small-first` to fit more files.
- Remember prompts/headers and wrappers count toward the budget.

