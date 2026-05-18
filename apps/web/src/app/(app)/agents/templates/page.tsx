import { Icon } from '@/components/ui/icon'
import { TopBar } from '@/components/app/top-bar'
import { CreateAgentButton } from '../create-agent-button'

export default function TemplateAgentsPage() {
  return (
    <>
      <TopBar
        title="Template Agents"
        searchPlaceholder="Search templates..."
        actions={
          <CreateAgentButton className="h-8 rounded-[5px] px-3 text-[12.5px] tracking-normal">
            Use template
            <Icon name="chevron-down" size="xs" />
          </CreateAgentButton>
        }
      />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="px-6 py-5">
          <div className="rounded-[8px] border border-dashed border-line bg-bg-subtle/40 px-6 py-16 text-center">
            <span className="mx-auto mb-3 grid size-9 place-items-center rounded-[6px] border border-line bg-bg text-fg-subtle">
              <Icon name="folder" size="md" />
            </span>
            <h2 className="text-[15px] font-semibold text-fg">No template agents yet</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-fg-muted">
              Once you save an agent as a template, it'll show up here so you can spin up new
              agents with the same prompts and voice settings in one click.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
