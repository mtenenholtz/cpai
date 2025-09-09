# Tokens & Budgets

CPAI counts tokens with `@dqbd/tiktoken`.

## Model & encoding

- Default encoding: `o200k_base` (good for modern GPT‑4.x/4o/1.x).
- For older GPT‑3.5/4 families, use `--encoding cl100k_base`.
- You can also set `--model` to let CPAI infer a sensible encoding.

## Estimates vs strict

- Selection is done by estimated per‑file tokens plus wrapper overhead.
- With `--strict` (default), CPAI re‑renders the final text and verifies it fits `--max-tokens`. If the rendered text exceeds the budget, the CLI errors unless `--truncate` is set, in which case it drops trailing files until it fits.

## Tips

- Switch `--pack-order small-first` to fit more files.
- Remember prompts/headers and wrappers count toward the budget.
