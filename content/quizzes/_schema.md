# Quiz bank format

One JSON file per topic in `content/quizzes/<id>.json`. Every `*.json` file in this
folder is validated by `tests/quiz.test.js` with `validateBank()` from
`src/quiz/quiz.js`, so a malformed bank fails `npm test`.

## Bank

| Key           | Required | Meaning |
|---------------|----------|---------|
| `id`          | yes | Lower-case slug, e.g. `"stack"`. Also the progress key for the bank. Must match the file name. |
| `title`       | yes | Shown to the student, e.g. `"Stack (LIFO)"`. |
| `topic`       | no  | Topic slug (usually the same as `id`). |
| `description` | no  | One sentence on what the bank covers. |
| `version`     | no  | Positive integer; bump when questions change meaning. |
| `reviewed`    | yes | `null` until `learning-content` signs off, then `{ "by": "...", "date": "YYYY-MM-DD" }`. |
| `questions`   | yes | Non-empty array of questions. |

Unknown keys are errors (so a typo like `"explaination"` is caught).

## Question

| Key           | Required | Meaning |
|---------------|----------|---------|
| `id`          | yes | Slug, unique within the bank, e.g. `"stack-004"`. Never reuse an id for a different question. |
| `type`        | yes | `mcq`, `multi`, `truefalse`, `predict` or `complexity`. |
| `difficulty`  | yes | `easy`, `medium` or `hard`. |
| `prompt`      | yes | The question text. |
| `choices`     | mcq, multi, complexity only | At least 2 unique non-empty strings. Forbidden on `truefalse` and `predict`. |
| `answer`      | yes | See the table below. |
| `explanation` | yes | At least 20 characters. Say why the answer is right **and** why the most tempting wrong answer is wrong. Shown after every answer, right or wrong. |
| `tags`        | yes | Array of strings (may be empty), e.g. `["overflow", "push"]`. |
| `hint`        | no  | A nudge that does not give the answer away. Using it costs nothing. |
| `page`        | no  | How to see it in the visualizer, e.g. `"On stack.html: push 3, then Pop."` |
| `format`      | predict only | `"text"` (default) or `"list"`. |
| `shuffle`     | no  | `false` keeps the choices in the written order (use for ordered scales). Default `true`. |

### `answer` by type

| Type         | `answer` | Student submits (to `grade`) |
|--------------|----------|------------------------------|
| `mcq`        | The **text** of the one correct choice | index into the prepared `choices` |
| `complexity` | The text of the correct choice; every choice must look like `O(...)`, `Θ(...)` or `Ω(...)` | index |
| `multi`      | Array of the texts of **all** correct choices (non-empty, no repeats) | array of indices, order ignored; must match exactly |
| `truefalse`  | `true` or `false` | `true`/`false`, or index 0 (True) / 1 (False) |
| `predict`    | A string, or an array of accepted strings | a typed string |

Answers are stored as text, not as an index, so reordering or editing choices can
never silently move the correct answer. `prepareQuiz()` shuffles choices and
records `answerIndex` / `answerIndices` for the shuffled order.

### Predict normalisation

Both the stored answer and the typed answer go through `normalizeAnswer()`:

- trim, lower-case, collapse whitespace, Unicode minus `−` becomes `-`
- one trailing `.` and one pair of wrapping brackets are dropped: `[1, 2]` → `1, 2`
- comma spacing is normalised: `1 ,2,3` → `1, 2, 3`
- `format: "list"`: items may be separated by commas and/or spaces, so `1 2 3`,
  `1,2,3` and `[1, 2, 3]` are all equal.

Use `"list"` for arrays and stack contents; keep `"text"` for single values.
If more than one wording is genuinely right, list them all in an array.

## Accuracy rules

- Check every answer against the real module in `src/`, not memory. Behaviour,
  messages, capacities, complexities and stability must match the code and page.
- `predict` (and other traced) answers in `stack.json` and `sorting.json` are
  recomputed from `src/structures/stack.js` and `src/algorithms/sorting.js` in
  `tests/quiz.test.js`. Add a verifier there when you add a traced question.
- Ambiguous questions get rewritten, not defended.
- Each bank should cover every type and every difficulty, with at least 10 questions.

## Example

```json
{
  "id": "stack-004",
  "type": "predict",
  "difficulty": "medium",
  "prompt": "A stack has capacity 3. You push 1, 2, 3 and then 4. What is the top index afterwards?",
  "answer": "2",
  "hint": "What happens to a push when every slot is already used?",
  "explanation": "Pushing 1, 2 and 3 fills indices 0-2, so top is 2. The push of 4 overflows and changes nothing. Answering 3 assumes the stack grew.",
  "tags": ["overflow", "top"],
  "page": "On stack.html: allocate capacity 3, push 1, 2, 3, then try to push 4."
}
```
