import { useCallback, useState } from 'react'
import type { ChatAttachment } from '@/lib/shared/chat/types'
import { MAX_CHAT_ATTACHMENTS } from '@/lib/shared/chat/types'

/**
 * Manages pending attachments for a chat composer: uploads picked files via the
 * provided upload fn (which returns a public URL), tracks them with their
 * name/type/size for the send payload, and exposes add/remove/clear + an
 * uploading flag.
 */
export function useChatComposerAttachments(upload: (file: File) => Promise<string>) {
  const [pending, setPending] = useState<ChatAttachment[]>([])
  const [uploading, setUploading] = useState(false)

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).slice(0, MAX_CHAT_ATTACHMENTS)
      if (list.length === 0) return
      setUploading(true)
      try {
        const uploaded = await Promise.all(
          list.map(async (f) => ({
            url: await upload(f),
            name: f.name,
            contentType: f.type,
            size: f.size,
          }))
        )
        setPending((prev) => [...prev, ...uploaded].slice(0, MAX_CHAT_ATTACHMENTS))
      } catch {
        // upload's onError handler surfaces the failure; drop the batch.
      } finally {
        setUploading(false)
      }
    },
    [upload]
  )

  const remove = useCallback((index: number) => {
    setPending((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clear = useCallback(() => setPending([]), [])

  return { pending, addFiles, remove, clear, uploading }
}
