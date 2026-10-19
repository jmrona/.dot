---
paths:
  - "**/*.js"
  - "**/*.mjs"
  - "**/*.cjs"
  - "**/*.jsx"
---

# JavaScript Coding Style

## Type Safety

Use JSDoc type annotations for better IDE support and runtime safety checks:

- Document function parameters and return types with `@param` and `@returns`
- Use `@type` for variable type hints
- Consider migrating to TypeScript for large codebases

## Modern JavaScript

- Use ES6+ features: arrow functions, destructuring, template literals, spread operators
- Use `const` by default; `let` only when reassignment is needed; never use `var`
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Use async/await over raw promises; avoid callback hell

## Strings

- Use template literals (backticks) for interpolation and multi-line strings
- Prefer single quotes for plain strings (or follow project convention)
- Use `String.trim()`, `String.includes()`, etc. over regex when possible

## Imports

- Use ES modules (`import`/`export`) over CommonJS (`require`/`module.exports`) in new code
- Order: external dependencies, internal modules, local files
- Use named exports over default exports for better refactoring support
- Never import entire libraries when you only need specific functions

## Naming

- `camelCase` for variables, functions, and methods
- `PascalCase` for classes and constructor functions
- `SCREAMING_SNAKE_CASE` for module-level constants
- Prefix private class fields with `#` (private class features)

## Idioms

- Use array methods (`map`, `filter`, `reduce`) over manual loops when appropriate
- Use object/array destructuring to extract values
- Use spread syntax for copying/merging arrays and objects
- Use `Object.freeze()` for immutable objects
- Prefer pure functions; minimise side effects
- Use `===` and `!==` for comparisons; never use `==` or `!=`

## React components, hooks, library
Before creating a new React component, hook, or library, check if one already exists in the `shared` folder that performs the same function. If it does, use that one. If it doesn't exist in the `shared` folder but you find a component that does the same thing elsewhere, consider whether it makes sense to move it to the `shared` folder; if so, move it, adjust it to meet the new requirements, and update existing imports to point to the `shared` location. Do not duplicate existing components, hooks, or libraries. Shared hooks must be placed in the `shared/hooks` folder, not in `libs`.

A `.jsx` or `.tsx` file **MUST** contain only one component that returns JSX. The only exception is a Skeleton component that belongs to the main component, for example `Card` and `CardSkeleton` in the same file. If you need another component that returns JSX, you **MUST** create it in a new file instead of adding it to the existing one.

You **SHOULD NOT** use inline `style` props when a class or a stylesheet rule can express the same styling.

You **SHOULD NOT** pass inline functions to event props. Define a named handler and pass it, for example `onClick={handleClick}`.