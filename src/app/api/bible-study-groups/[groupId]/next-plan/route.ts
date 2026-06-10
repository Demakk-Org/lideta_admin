import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebase/admin';
import Logger from '@/lib/utils/logger';

// Leader-triggered "move to next plan": summarize the current plan's
// conversation (questions raised + verses shared + a promoted summary message)
// into a MeetingSummary stored per-study, then advance the group's progress.
//
// Meeting summaries are stored separately from the group document, mirroring the
// chat: bible_study_groups/{groupId}/bible_studies/{bibleStudyId}/meeting_summaries.

type NextPlanPayload = {
  leaderUserId: string;
  bibleStudyId: string;
  // Optional plan summary chosen by the leader. Either promote an existing
  // member message by id, or pass typed text. If neither is sent, the leader
  // skipped it and the summary is stored empty. `summaryMessageId` wins if both.
  summaryMessageId?: string;
  summaryText?: string;
};

type VerseData = {
  book_name: string;
  book: number;
  chapter: number;
  verse: number;
  text: string;
};

function toInt(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
  if (typeof val === 'string') {
    const n = parseInt(val, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

// A "verse" message stores its Verse as a JSON string in `content`.
function parseVerseContent(content: unknown): VerseData | null {
  if (typeof content !== 'string' || !content.trim()) return null;
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    if (typeof raw !== 'object' || raw === null) return null;
    return {
      book_name: typeof raw.book_name === 'string' ? raw.book_name : '',
      book: toInt(raw.book),
      chapter: toInt(raw.chapter),
      verse: toInt(raw.verse),
      text: typeof raw.text === 'string' ? raw.text : '',
    };
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const routeName = '[bibleStudyGroupsApi] POST next-plan';
  try {
    const { groupId } = await params;
    const body = (await req.json()) as Partial<NextPlanPayload>;

    if (!groupId || typeof groupId !== 'string') {
      return NextResponse.json({ error: 'Invalid group id' }, { status: 400 });
    }

    const leaderUserId = (body.leaderUserId ?? '').trim();
    const bibleStudyId = (body.bibleStudyId ?? '').trim();
    const summaryMessageId = (body.summaryMessageId ?? '').trim();
    const typedSummaryText =
      typeof body.summaryText === 'string' ? body.summaryText.trim() : '';
    Logger.info(routeName, 'Request received', {
      groupId,
      leaderUserId,
      bibleStudyId,
      summaryMessageId: summaryMessageId || null,
      hasTypedSummary: Boolean(typedSummaryText),
    });

    if (!leaderUserId || !bibleStudyId) {
      Logger.info(routeName, 'Rejected: missing required fields', {
        hasLeaderUserId: Boolean(leaderUserId),
        hasBibleStudyId: Boolean(bibleStudyId),
      });
      return NextResponse.json(
        { error: 'leaderUserId and bibleStudyId are required' },
        { status: 400 },
      );
    }

    const groupRef = adminDb.collection('bible_study_groups').doc(groupId);
    const groupSnap = await groupRef.get();
    if (!groupSnap.exists) {
      Logger.info(routeName, 'Rejected: group not found', { groupId });
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    const group = groupSnap.data() as Record<string, unknown>;

    // Only the group leader may advance the plan.
    const groupLeader =
      (typeof group.leader === 'string' && group.leader) ||
      (typeof group.leaderUserId === 'string' && group.leaderUserId) ||
      '';
    if (groupLeader !== leaderUserId) {
      Logger.info(routeName, 'Rejected: caller is not the group leader', {
        groupId,
        leaderUserId,
        groupLeader,
      });
      return NextResponse.json(
        { error: 'Only the group leader can move to the next plan' },
        { status: 403 },
      );
    }

    const bibleStudyIds = Array.isArray(group.bibleStudyIds)
      ? group.bibleStudyIds.map((v) => String(v))
      : [];
    if (!bibleStudyIds.includes(bibleStudyId)) {
      Logger.info(routeName, 'Rejected: bibleStudyId not in group', {
        groupId,
        bibleStudyId,
        bibleStudyIds,
      });
      return NextResponse.json(
        { error: 'bibleStudyId is not part of this group' },
        { status: 400 },
      );
    }

    const currentProgress = toInt(group.progress);

    // Determine whether this is the last plan of the study, to decide between
    // "moved to next plan" and "finished study". progress is the 0-based index
    // of the current plan within the study's studyPlans.
    const studySnap = await adminDb
      .collection('bible_studies')
      .doc(bibleStudyId)
      .get();
    const studyPlans = Array.isArray(studySnap.data()?.studyPlans)
      ? (studySnap.data()!.studyPlans as unknown[])
      : [];
    const planCount = studyPlans.length;
    const isLastPlan = planCount > 0 && currentProgress >= planCount - 1;

    Logger.info(routeName, 'Authorized; group loaded', {
      groupId,
      currentProgress,
      studyCount: bibleStudyIds.length,
      planCount,
      isLastPlan,
    });

    const threadRef = groupRef
      .collection('bible_studies')
      .doc(bibleStudyId);

    // Scope the conversation to messages after the last meeting summary.
    const lastSummarySnap = await threadRef
      .collection('meeting_summaries')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const lastSummaryAt = lastSummarySnap.empty
      ? null
      : (lastSummarySnap.docs[0].data().createdAt ?? null);

    const messagesCol = threadRef.collection('messages');
    const messagesSnap = await (
      lastSummaryAt
        ? messagesCol
            .where('timestamp', '>', lastSummaryAt)
            .orderBy('timestamp', 'asc')
        : messagesCol.orderBy('timestamp', 'asc')
    ).get();

    Logger.info(routeName, 'Scoped conversation', {
      groupId,
      bibleStudyId,
      hasPriorSummary: Boolean(lastSummaryAt),
      messageCount: messagesSnap.size,
    });

    const questions: string[] = [];
    const verses: VerseData[] = [];

    for (const d of messagesSnap.docs) {
      const m = d.data() as Record<string, unknown>;
      const type = typeof m.type === 'string' ? m.type : 'text';
      const content = m.content;
      if (type === 'question') {
        if (typeof content === 'string' && content.trim()) {
          questions.push(content.trim());
        }
      } else if (type === 'verse') {
        const v = parseVerseContent(content);
        if (v) verses.push(v);
      }
    }

    // Resolve the plan summary text chosen by the leader:
    //   1. a promoted member message (summaryMessageId)
    //   2. typed text (summaryText)
    //   3. skipped -> empty string
    let summaryText = '';
    if (summaryMessageId) {
      // Prefer the message we already fetched in the scoped set; fall back to a
      // direct lookup (it may be outside the time window).
      const inScope = messagesSnap.docs.find((d) => d.id === summaryMessageId);
      const msgSnap =
        inScope ?? (await messagesCol.doc(summaryMessageId).get());
      if (!msgSnap.exists) {
        Logger.info(routeName, 'Rejected: promoted summary message not found', {
          groupId,
          bibleStudyId,
          summaryMessageId,
          lookedUpPath: `${messagesCol.path}/${summaryMessageId}`,
          foundInScope: Boolean(inScope),
          scopedMessageCount: messagesSnap.size,
        });
        return NextResponse.json(
          { error: 'Summary message not found in this study thread' },
          { status: 400 },
        );
      }
      const c = (msgSnap.data() as Record<string, unknown>).content;
      summaryText = typeof c === 'string' ? c.trim() : '';
    } else if (typedSummaryText) {
      summaryText = typedSummaryText;
    }

    const summarySource = summaryMessageId
      ? 'promotedMessage'
      : typedSummaryText
        ? 'typedText'
        : 'skipped';
    Logger.info(routeName, 'Aggregated conversation', {
      groupId,
      bibleStudyId,
      questionCount: questions.length,
      verseCount: verses.length,
      summarySource,
      summaryLength: summaryText.length,
    });

    // Store the meeting summary in the per-study subcollection.
    const summaryDoc = {
      progress: currentProgress,
      questions,
      verses,
      summary: summaryText,
      bibleStudyId,
      createdAt: FieldValue.serverTimestamp(),
    };
    const summaryRef = await threadRef
      .collection('meeting_summaries')
      .add(summaryDoc);

    // Post a system message marking the transition.
    const systemContent = isLastPlan
      ? 'Finished study'
      : 'Moved to the next study plan';
    await threadRef.collection('messages').add({
      senderId: null,
      content: systemContent,
      timestamp: FieldValue.serverTimestamp(),
      isEdited: false,
      isSystem: true,
      attachments: [],
      replyToMessageId: null,
      mentionedUserIds: [],
      type: 'system',
      bibleStudyId,
      groupId,
    });

    // Advance the group's progress by one plan; on the last plan, also mark the
    // study completed.
    const groupUpdate: Record<string, unknown> = {
      progress: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (isLastPlan) {
      groupUpdate.completedBibleStudyIds = FieldValue.arrayUnion(bibleStudyId);
    }
    await groupRef.update(groupUpdate);

    Logger.info(routeName, 'Created meeting summary and advanced progress', {
      groupId,
      bibleStudyId,
      summaryId: summaryRef.id,
      questionCount: questions.length,
      verseCount: verses.length,
      hasSummaryText: Boolean(summaryText),
      fromProgress: currentProgress,
      toProgress: currentProgress + 1,
      isLastPlan,
      systemMessage: systemContent,
    });

    return NextResponse.json({
      ok: true,
      summaryId: summaryRef.id,
      progress: currentProgress + 1,
      finished: isLastPlan,
      summary: {
        progress: currentProgress,
        questions,
        verses,
        summary: summaryText,
        bibleStudyId,
      },
    });
  } catch (error) {
    Logger.error(routeName, 'Failed to move to next plan', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to move to next plan' },
      { status: 500 },
    );
  }
}
