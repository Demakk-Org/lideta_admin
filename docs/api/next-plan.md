# Move to Next Plan — API Documentation

Advances a bible-study group to the next plan. It summarizes the current plan's
chat conversation (questions raised, verses shared, and the latest member
summary message) into a `MeetingSummary`, stores it per-study, then increments
the group's `progress`.

Source: [`src/app/api/bible-study-groups/[groupId]/next-plan/route.ts`](../../src/app/api/bible-study-groups/[groupId]/next-plan/route.ts)

---

## Endpoint

```
POST /api/bible-study-groups/{groupId}/next-plan
```

| | |
|---|---|
| **Method** | `POST` |
| **Auth** | Caller must be the group's leader (enforced via `leaderUserId` in the body) |
| **Content-Type** | `application/json` |

### Path parameters

| Name | Type | Description |
|---|---|---|
| `groupId` | string | The `bible_study_groups` document id. |

### Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `leaderUserId` | string | yes | Must equal the group's `leader`/`leaderUserId`. |
| `bibleStudyId` | string | yes | The study whose thread is being summarized. Must be one of the group's `bibleStudyIds`. |
| `summaryMessageId` | string | no | Id of a member chat message in this study thread to **promote** as the plan summary; its `content` becomes the summary text. |
| `summaryText` | string | no | Leader-typed summary text. Used only when `summaryMessageId` is not sent. |

The plan summary text is chosen by the leader. Send **one** of
`summaryMessageId` or `summaryText`, or **neither** to skip it (stored as `""`).
If both are sent, `summaryMessageId` wins.

```json
{
  "leaderUserId": "user_abc",
  "bibleStudyId": "study_123",
  "summaryMessageId": "msg_789"
}
```

```json
{
  "leaderUserId": "user_abc",
  "bibleStudyId": "study_123",
  "summaryText": "This week we focused on grace and forgiveness."
}
```

---

## Behavior

1. Loads `bible_study_groups/{groupId}`.
2. Authorizes: `leaderUserId` must match the group leader.
3. Validates `bibleStudyId` belongs to the group.
4. Finds the most recent meeting summary in that study thread and scopes the
   conversation to **messages after it** (all messages if there's no prior
   summary).
5. From `bible_study_groups/{groupId}/bible_studies/{bibleStudyId}/messages` (scoped):
   - `type: "question"` → `questions[]` (the message `content`).
   - `type: "verse"` → JSON-parses `content` into
     `{ book_name, book, chapter, verse, text }` → `verses[]`.
6. Resolves the `summary` text from the request: the promoted message's
   `content` (`summaryMessageId`), else the typed `summaryText`, else `""`.
7. Writes a `MeetingSummary` to
   `bible_study_groups/{groupId}/bible_studies/{bibleStudyId}/meeting_summaries` (auto id,
   plus a `createdAt` server timestamp).
8. Determines whether this was the **last plan** of the study by reading
   `bible_studies/{bibleStudyId}.studyPlans` (last plan when
   `progress >= studyPlans.length - 1`).
9. Posts a **system message** into the study thread: `"Moved to the next study
   plan"`, or `"Finished study"` if it was the last plan.
10. Increments the group's `progress` by 1 and sets `updatedAt`. If it was the
    last plan, also adds `bibleStudyId` to the group's `completedBibleStudyIds`
    (`arrayUnion`).

---

## Responses

### `200 OK`

```json
{
  "ok": true,
  "summaryId": "Xy7aB2c...",
  "progress": 3,
  "finished": false,
  "summary": {
    "progress": 2,
    "questions": [
      "What does grace mean here?",
      "How do we apply verse 9?"
    ],
    "verses": [
      { "book_name": "ዮሐንስ", "book": 43, "chapter": 3, "verse": 16, "text": "..." }
    ],
    "summary": "This week we focused on grace and forgiveness...",
    "bibleStudyId": "study_123"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | Always `true` on success. |
| `summaryId` | string | Id of the created `meeting_summaries` doc. |
| `progress` | number | The group's **new** progress (after increment). |
| `finished` | boolean | `true` if this was the study's last plan (study marked completed). |
| `summary.progress` | number | The progress value the summary covers (before increment). |
| `summary.questions` | string[] | Questions raised in the scoped conversation. |
| `summary.verses` | Verse[] | Verses shared (`book_name`, `book`, `chapter`, `verse`, `text`). |
| `summary.summary` | string | Latest member summary message text, or `""`. |
| `summary.bibleStudyId` | string | The study this summary belongs to. |

### Error responses

| Status | `error` | When |
|---|---|---|
| `400` | `Invalid group id` | `groupId` missing/invalid. |
| `400` | `leaderUserId and bibleStudyId are required` | Missing body fields. |
| `400` | `bibleStudyId is not part of this group` | Study not in the group's `bibleStudyIds`. |
| `400` | `Summary message not found in this study thread` | `summaryMessageId` doesn't exist in the thread's messages. |
| `403` | `Only the group leader can move to the next plan` | `leaderUserId` ≠ group leader. |
| `404` | `Group not found` | No group doc for `groupId`. |
| `500` | `Failed to move to next plan` | Unexpected server error. |

```json
{ "error": "Only the group leader can move to the next plan" }
```

---

## Side effects

- **Creates** one doc in
  `bible_study_groups/{groupId}/bible_studies/{bibleStudyId}/meeting_summaries`.
- **Creates** a system message (`type: "system"`, `isSystem: true`) in that
  study thread's `messages` — `"Moved to the next study plan"` or
  `"Finished study"`.
- **Updates** `bible_study_groups/{groupId}`: `progress += 1`,
  `updatedAt = serverTimestamp()`, and on the last plan
  `completedBibleStudyIds += bibleStudyId`.
- **Idempotency:** _not_ idempotent — each call creates a new summary and
  advances progress. The client should disable the button while the request is
  in flight.

---

## Example

```bash
curl -X POST \
  "https://<host>/api/bible-study-groups/grp_001/next-plan" \
  -H "Content-Type: application/json" \
  -d '{ "leaderUserId": "user_abc", "bibleStudyId": "study_123" }'
```

---

## Notes

- A **verse** message must store its verse as a JSON string in `content`, e.g.
  `"{\"book_name\":\"...\",\"book\":43,\"chapter\":3,\"verse\":16,\"text\":\"...\"}"`;
  unparseable verse messages are skipped.
- The `summary` text is leader-driven: promote a member message
  (`summaryMessageId`), type one (`summaryText`), or skip it (empty). The
  promoted message can be any message in the thread — its `content` is used
  verbatim.
- `progress++` only — no study rollover (`currentStudyIndex` /
  `completedBibleStudyIds` unchanged).
- Meeting summaries are stored **separately** from the group document (mirroring
  chat messages), per `(group, bibleStudy)`.
