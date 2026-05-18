import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { TopBar } from '@/components/app/top-bar'
import { CreateAgentButton } from '../create-agent-button'

export const metadata = { title: 'New agent - LivoCall' }

export default function NewAgentPage() {
  return (
    <>
      <TopBar
        title="Create agent"
        searchPlaceholder="Search agents..."
        actions={
          <Link
            href="/agents"
            className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line bg-bg px-3 text-[12.5px] font-medium text-fg transition hover:bg-bg-muted"
          >
            Cancel
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="px-6 py-5">
          <div className="rounded-[8px] border border-dashed border-line bg-bg-subtle/40 px-6 py-16 text-center">
            <span className="mx-auto mb-3 grid size-9 place-items-center rounded-[6px] border border-line bg-bg text-fg-subtle">
              <Icon name="bot" size="md" />
            </span>
            <h1 className="text-[15px] font-semibold text-fg">Open the main editor</h1>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-fg-muted">
              Create a draft and continue in the same editor used for existing agents.
            </p>
            <CreateAgentButton className="mt-4">Create agent</CreateAgentButton>
          </div>
        </div>
      </div>
    </>
  )
}
