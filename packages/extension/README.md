# bigER — ER modeling for VS Code

[Langium](https://langium.org/)-based realization of [bigER](https://github.com/borkdominik/bigER). Write entity-relationship models in `.er` files with full language support, a live diagram view, and SQL / MongoDB code generation.

## Features

- **Language support** for `.er` / `.erd` files: syntax highlighting, validation, completion.
- **Diagram view** — open a live ER diagram from any model (`Open in Diagram`).
- **Code generation** via the editor context menu or command palette:
  - Generate SQL (generic), PostgreSQL, MySQL
  - Generate MongoDB initialization scripts

## Usage

1. Create a file ending in `.er`.
2. Declare a model, e.g.:
   ```er
   erdiagram example

   entity Customer {
     id: INT key
     name: VARCHAR(255)
   }
   ```
3. Right-click → **Generate ▸ …** to export, or use **Open in Diagram**.

## Settings

- `biger.generateDrop` — also emit `DROP TABLE` statements when generating SQL.
- `biger.export.typeMappings` — override how ER datatypes map to each target's types.

See the repository README for the full modeling guide.
