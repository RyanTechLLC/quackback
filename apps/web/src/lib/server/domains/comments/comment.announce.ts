/**
 * announcePublishedComment — deferred external dispatch for moderated comments.
 *
 * Fired when a comment becomes publicly visible:
 *  - At create time (in comment.service.ts) when the comment is NOT held.
 *  - At approve time (approveCommentFn), after a pending comment is released.
 *
 * Sends the comment.created webhook event. The actor is always the comment's
 * original author, not the moderator. Mirrors announcePublishedPost.
 */

import { db, boards, comments, posts, principal as principalTable, eq } from '@/lib/server/db'
import { type CommentId } from '@quackback/ids'
import { dispatchCommentCreated, buildEventActor } from '@/lib/server/events/dispatch'

/**
 * Dispatch the comment.created event for a comment that has just become
 * visible after moderator approval. Loads the comment, parent post, board,
 * and author from the database so the approve call site stays simple.
 */
export async function announcePublishedComment(commentId: CommentId): Promise<void> {
  const commentRow = await db.query.comments.findFirst({ where: eq(comments.id, commentId) })
  if (!commentRow) return
  const postRow = await db.query.posts.findFirst({ where: eq(posts.id, commentRow.postId) })
  if (!postRow) return
  const boardRow = await db.query.boards.findFirst({ where: eq(boards.id, postRow.boardId) })
  if (!boardRow) return
  const authorRow = await db.query.principal.findFirst({
    where: eq(principalTable.id, commentRow.principalId),
    with: { user: { columns: { id: true, name: true, email: true } } },
  })

  const author = {
    principalId: commentRow.principalId,
    userId: authorRow?.user?.id,
    name: authorRow?.user?.name ?? undefined,
    email: authorRow?.user?.email ?? undefined,
    displayName: authorRow?.displayName ?? undefined,
  }
  const actorName = author.displayName ?? author.name

  await dispatchCommentCreated(
    buildEventActor(author),
    {
      id: commentRow.id,
      content: commentRow.content,
      authorName: actorName,
      authorEmail: author.email,
      isPrivate: commentRow.isPrivate ?? false,
    },
    {
      id: postRow.id,
      title: postRow.title,
      boardId: boardRow.id,
      boardSlug: boardRow.slug,
    }
  )
}
