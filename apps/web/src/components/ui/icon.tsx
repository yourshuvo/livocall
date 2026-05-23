import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BellIcon,
  BookOpenIcon,
  BuildingsIcon,
  CalendarCheckIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpDownIcon,
  ChartBarIcon,
  ChatCircleTextIcon,
  CheckIcon,
  CodeIcon,
  ClockIcon,
  ColumnsIcon,
  CpuIcon,
  CreditCardIcon,
  DatabaseIcon,
  FolderIcon,
  GearIcon,
  GlobeIcon,
  GraduationCapIcon,
  HashIcon,
  HeadsetIcon,
  LightningIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  MicrophoneIcon,
  MinusIcon,
  DotsThreeOutlineIcon,
  PhoneIcon,
  PhoneCallIcon,
  PhoneIncomingIcon,
  PhoneOutgoingIcon,
  PlugsIcon,
  PlusIcon,
  PulseIcon,
  QuestionIcon,
  QuotesIcon,
  RobotIcon,
  FlowArrowIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  ShieldIcon,
  ShoppingBagOpenIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  SparkleIcon,
  SpeakerHighIcon,
  StethoscopeIcon,
  UploadSimpleIcon,
  WalletIcon,
  WaveformIcon,
  WavesIcon,
  XIcon,
} from '@phosphor-icons/react/dist/ssr'
import type { Icon as PhosphorIcon, IconWeight } from '@phosphor-icons/react'

import { cn } from '@/lib/cn'

/**
 * Icon system. Backed by `@phosphor-icons/react`.
 *
 * Usage:
 *   <Icon name="phone" />              — bare icon (default)
 *   <Icon name="phone" square />       — hairline-bordered tile
 *   <Icon name="phone" size="lg" />    — sizes: xs / sm / md / lg / xl
 */

export type IconName =
  | 'phone'
  | 'phone-out'
  | 'phone-in'
  | 'phone-call'
  | 'mic'
  | 'speaker'
  | 'wave'
  | 'cpu'
  | 'server'
  | 'sip'
  | 'route'
  | 'shield'
  | 'shield-check'
  | 'check'
  | 'check-badge'
  | 'x'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up-down'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'arrow-down-right'
  | 'plus'
  | 'minus'
  | 'sparkles'
  | 'logout'
  | 'settings'
  | 'book'
  | 'wallet'
  | 'hash'
  | 'bot'
  | 'dashboard'
  | 'globe'
  | 'currency'
  | 'clock'
  | 'activity'
  | 'quote'
  | 'shopping-bag'
  | 'headset'
  | 'building'
  | 'stethoscope'
  | 'graduation'
  | 'database'
  | 'plug'
  | 'code'
  | 'bar-chart'
  | 'bell'
  | 'message-square'
  | 'folder'
  | 'more-horizontal'
  | 'panel-left'
  | 'search'
  | 'upload'
  | 'megaphone'
  | 'credit-card'
  | 'calendar-clock'
  | 'help'
  | 'zap'

const registry: Record<IconName, PhosphorIcon | 'currency'> = {
  phone: PhoneIcon,
  'phone-out': PhoneOutgoingIcon,
  'phone-in': PhoneIncomingIcon,
  'phone-call': PhoneCallIcon,
  mic: MicrophoneIcon,
  speaker: SpeakerHighIcon,
  wave: WaveformIcon,
  cpu: CpuIcon,
  server: ColumnsIcon,
  sip: WavesIcon,
  route: FlowArrowIcon,
  shield: ShieldIcon,
  'shield-check': ShieldCheckIcon,
  check: CheckIcon,
  'check-badge': SealCheckIcon,
  x: XIcon,
  'chevron-left': CaretLeftIcon,
  'chevron-right': CaretRightIcon,
  'chevron-down': CaretDownIcon,
  'chevron-up-down': CaretUpDownIcon,
  'arrow-right': ArrowRightIcon,
  'arrow-up-right': ArrowUpRightIcon,
  'arrow-down-right': ArrowDownRightIcon,
  plus: PlusIcon,
  minus: MinusIcon,
  sparkles: SparkleIcon,
  logout: SignOutIcon,
  settings: GearIcon,
  book: BookOpenIcon,
  wallet: WalletIcon,
  hash: HashIcon,
  bot: RobotIcon,
  dashboard: ColumnsIcon,
  globe: GlobeIcon,
  // No Lucide BDT glyph — render the text symbol inside the tile.
  currency: 'currency',
  clock: ClockIcon,
  activity: PulseIcon,
  quote: QuotesIcon,
  'shopping-bag': ShoppingBagOpenIcon,
  headset: HeadsetIcon,
  building: BuildingsIcon,
  stethoscope: StethoscopeIcon,
  graduation: GraduationCapIcon,
  database: DatabaseIcon,
  plug: PlugsIcon,
  code: CodeIcon,
  'bar-chart': ChartBarIcon,
  bell: BellIcon,
  'message-square': ChatCircleTextIcon,
  folder: FolderIcon,
  'more-horizontal': DotsThreeOutlineIcon,
  'panel-left': SidebarSimpleIcon,
  search: MagnifyingGlassIcon,
  upload: UploadSimpleIcon,
  megaphone: MegaphoneIcon,
  'credit-card': CreditCardIcon,
  'calendar-clock': CalendarCheckIcon,
  help: QuestionIcon,
  zap: LightningIcon,
}

const tileSize = {
  xs: 'size-4',
  sm: 'size-5',
  md: 'size-6',
  lg: 'size-7',
  xl: 'size-9',
}

const glyphSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
}

export function Icon({
  name,
  size = 'md',
  className,
  square = false,
  strokeWidth: _strokeWidth = 1.6,
  weight = 'regular',
}: {
  name: IconName
  size?: keyof typeof tileSize
  className?: string
  /**
   * If `square`, renders the icon inside a hairline-bordered tile. Otherwise
   * renders the bare glyph (default).
   */
  square?: boolean
  /** Kept for backwards compatibility; Phosphor uses weight instead. */
  strokeWidth?: number
  weight?: IconWeight
}) {
  const entry = registry[name]
  const px = glyphSize[size]
  const glyph =
    entry === 'currency' ? (
      <span
        aria-hidden
        className="font-display font-medium leading-none"
        style={{ fontSize: px + 1 }}
      >
        ৳
      </span>
    ) : (
      (() => {
        const Cmp = entry
        return (
          <Cmp
            aria-hidden
            size={px}
            weight={weight}
            className="shrink-0"
          />
        )
      })()
    )

  if (!square) {
    return (
      <span
        aria-hidden="true"
        className={cn('inline-flex items-center justify-center text-current', className)}
      >
        {glyph}
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-center justify-center text-fg-muted',
        tileSize[size],
        className,
      )}
    >
      {glyph}
    </span>
  )
}

// Backwards-compat for any callers that imported the registry.
export const iconRegistry = registry
