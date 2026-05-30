import { useIntl } from 'react-intl'
import { ChevronLeftIcon, ChevronRightIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { usePillsScroll } from '@/lib/client/hooks/use-pills-scroll'
import { cn } from '@/lib/shared/utils'

interface RoadmapTabItem {
  id: string
  name: string
  /** Private roadmaps (isPublic === false) are only listed for team/staff. */
  isPublic?: boolean
}

interface RoadmapTabsProps {
  roadmaps: RoadmapTabItem[]
  selectedId: string | null | undefined
  onSelect: (id: string) => void
}

/** Horizontal scrolling tab strip for switching between roadmaps. */
export function RoadmapTabs({ roadmaps, selectedId, onSelect }: RoadmapTabsProps) {
  const intl = useIntl()
  const pills = usePillsScroll()

  return (
    <div className="relative">
      <div
        ref={pills.ref}
        className="flex gap-1 overflow-x-auto scrollbar-none px-1 pb-0.5"
        role="tablist"
        aria-label={intl.formatMessage({
          id: 'portal.roadmap.tabs.aria',
          defaultMessage: 'Roadmaps',
        })}
      >
        {roadmaps.map((roadmap) => {
          const isActive = selectedId === roadmap.id
          return (
            <button
              key={roadmap.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(roadmap.id)}
              className={cn(
                'rounded-full text-sm px-3 py-1 whitespace-nowrap transition-colors shrink-0 inline-flex items-center gap-1',
                isActive
                  ? 'bg-foreground/10 text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {roadmap.isPublic === false && (
                <LockClosedIcon
                  className="w-3 h-3 shrink-0"
                  aria-label={intl.formatMessage({
                    id: 'portal.roadmap.tabs.private',
                    defaultMessage: 'Private roadmap',
                  })}
                />
              )}
              {roadmap.name}
            </button>
          )
        })}
      </div>

      {pills.canScrollLeft && (
        <button
          type="button"
          onClick={() => pills.scrollBy(-160)}
          aria-label={intl.formatMessage({
            id: 'portal.roadmap.tabs.scrollLeft',
            defaultMessage: 'Scroll left',
          })}
          className="absolute start-0 top-0 bottom-0.5 flex items-center ps-0.5 pe-6 bg-gradient-to-r from-background via-background/80 to-transparent"
        >
          <ChevronLeftIcon className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
      {pills.canScrollRight && (
        <button
          type="button"
          onClick={() => pills.scrollBy(160)}
          aria-label={intl.formatMessage({
            id: 'portal.roadmap.tabs.scrollRight',
            defaultMessage: 'Scroll right',
          })}
          className="absolute end-0 top-0 bottom-0.5 flex items-center pe-0.5 ps-6 bg-gradient-to-l from-background via-background/80 to-transparent"
        >
          <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}
