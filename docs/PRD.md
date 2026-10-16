# PRD: SponsorOps

**Owner:** Ritambra  |  **Status:** v1 shipped  |  **Last updated:** 2026-10-16

## 1. Problem
Student organisations (Enactus, Product Management Club, fests like APOGEE) raise sponsorship through cold outreach. Today an organiser spends roughly [X] minutes per prospect researching the company, finding a hook and writing a personalised email, then tracks everything in scattered sheets and chats. Result: slow throughput, generic emails, duplicate outreach to the same company by different team members, and forgotten follow-ups.

## 2. Users
| User | Need |
|---|---|
| Outreach coordinator (primary) | Faster, better-researched first drafts; nothing slips through |
| Team lead / approver | Control over what goes out; visibility into the pipeline |

## 3. Goals and non-goals
**Goals**
1. Cut time-to-first-draft per prospect from [X] min to under 5 min of human effort (review included).
2. Zero duplicate outreach to the same company.
3. Every approved lead gets a follow-up reminder.
4. Human approval before any email leaves the team.

**Non-goals (v1)**
- Sending email automatically (deliberate; see risks).
- Finding individual contacts' emails.
- Multi-step sequences or A/B testing.

## 4. User stories
1. As a coordinator, I type `/lead add <company>` so I get a researched draft without leaving Slack.
2. As a coordinator, I can pass extra context (`| they sponsored X last year`) to steer the draft.
3. As an approver, I can approve, edit, or reject the draft with one click.
4. As a teammate, I am told if a company is already in the pipeline.
5. As a coordinator, I am reminded to follow up N days after approval and can mark replied / snooze / close.
6. As a team lead, I get a daily digest of new leads, pending approvals and overdue follow-ups.
7. As a team lead, I can run `/lead stats` to see approval rate, edit rate and time saved.

## 5. Functional requirements
| ID | Requirement | Priority |
|---|---|---|
| F1 | `/lead add` acks within 3s and shows live progress | P0 |
| F2 | Agent researches via web search and cites sources | P0 |
| F3 | Draft passes validation (length, subject, confidence/source rules) or agent retries | P0 |
| F4 | Duplicate check before agent runs | P0 |
| F5 | Approve / Edit (modal) / Reject buttons; handled drafts cannot be re-actioned | P0 |
| F6 | Leads persisted (JSON or Airtable) | P0 |
| F7 | Follow-up DM after `FOLLOWUP_DAYS` with replied / snooze / close | P1 |
| F8 | Nudge when a draft is unapproved after `APPROVAL_TIMEOUT_HOURS` | P1 |
| F9 | Daily digest to a channel | P1 |
| F10 | `/lead list` and `/lead stats` | P1 |

## 6. Success metrics
| Metric | Definition | Target |
|---|---|---|
| Time per lead | Human minutes (review + edit) vs measured manual baseline | at least 60% reduction |
| Approval rate | approved / (approved + rejected) | at least 70% |
| Edit rate | approved drafts edited by a human | track (lower = better drafts) |
| Factual error rate | drafts with a wrong claim found in review | under 5% |
| Reply rate | replied / approved | track vs historical baseline |
| Duplicate outreach | duplicates sent | 0 |

## 7. Failure modes and handling
| Failure | Handling |
|---|---|
| Duplicate company (name variants like "Acme Pvt Ltd") | Normalised name match; ephemeral warning, no tokens spent |
| Research finds nothing useful | Draft marked low confidence with a visible warning; human decides |
| Agent output malformed or too long | Validation rejects; agent retries; after max turns the user sees a clear error |
| Web search unavailable | Falls back to no-search mode, forced low confidence |
| API timeout or error | Hard timeout; placeholder message updated with the error and a retry hint |
| Bot not in channel | Clear instruction to `/invite` |
| Two people click Approve at once | Second click is told the draft was already handled |
| Approval never happens | Nudge in thread after timeout |
| Prompt injection via web page | System prompt treats web text as data; the agent has no tool that can send or exfiltrate |
| Hallucinated facts | Only sourced claims allowed; human approval is the final control |

## 8. Why human-in-the-loop (decision log)
Outreach is reputation-sensitive and one wrong claim to a sponsor is costly. LLM research is good but not perfect. Keeping approval manual gives most of the speed gain with almost none of the risk. Auto-send can be considered later for high-confidence drafts once the measured factual error rate is consistently low.

## 9. Rollout plan
1. Dogfood with 10 to 20 real or test prospects; record results in `docs/TEST_LOG.md`.
2. Fix prompt and guardrail gaps found in testing.
3. Invite the full outreach team; review `/lead stats` weekly.

## 10. Future work
- Gmail drafts integration (create a draft in the user's inbox on approval).
- Contact discovery and email verification.
- Multi-step follow-up sequences.
- Per-industry prompt tuning from approval/edit data.
