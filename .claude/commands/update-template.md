---
description: Update the Claude setup for the current project.
---

!`tree .claude/`

Based on files list above:

1. **Copy new files** from the project template `https://github.com/DiogoNeves/claude-template` `.claude` folder, into the current project `.claude` folder.
2. **If any files already exist** ask the user if they want to override using the `AskUserQuestionTool`.
3. **If the user decides to override** copy the remaining files, otherwise we're done.
