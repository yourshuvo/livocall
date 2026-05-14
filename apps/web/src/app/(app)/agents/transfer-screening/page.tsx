import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { TopBar } from '@/components/app/top-bar'

export default function TransferScreeningPage() {
  return (
    <>
      <TopBar
        title="Transfer Screening Agents"
        searchPlaceholder="Search transfer agents..."
        actions={
          <Link
            href="/agents/new"
            className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-fg px-3 text-[12.5px] font-medium text-fg-inverse transition hover:bg-fg-strong"
          >
            Create transfer agent
            <Icon name="chevron-down" size="xs" />
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="px-6 py-5">
          <div className="rounded-[8px] border border-dashed border-line bg-bg-subtle/40 px-6 py-16 text-center">
            <span className="mx-auto mb-3 grid size-9 place-items-center rounded-[6px] border border-line bg-bg text-fg-subtle">
              <Icon name="shield-check" size="md" />
            </span>
            <h2 className="text-[15px] font-semibold text-fg">No transfer screening agents</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-fg-muted">
              Transfer screening agents qualify callers before handing them off to a human.
              Configure prompts, scripted questions, and routing rules here.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
