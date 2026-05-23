export const clerkAppearance = {
  variables: {
    borderRadius: '10px',
    colorBackground: '#ffffff',
    colorDanger: '#ef4444',
    colorInputBackground: '#f5f5f7',
    colorInputText: '#141414',
    colorPrimary: '#2563eb',
    colorText: '#141414',
    colorTextSecondary: '#5c5c5c',
    fontFamily: 'var(--font-sans)',
  },
  elements: {
    avatarBox: 'rounded-full',
    card: 'border border-line bg-bg shadow-card',
    cardBox: 'shadow-none',
    dividerLine: 'bg-line',
    dividerText: 'text-fg-faint',
    footerActionLink: 'font-medium text-fg hover:text-fg-strong',
    formButtonPrimary:
      'h-11 rounded-[10px] bg-blue-600 text-[13px] font-semibold text-white shadow-none hover:bg-blue-700',
    formFieldInput:
      'h-11 rounded-[10px] border border-[#D2D4D6] bg-[#F5F5F7] text-[14px] text-fg shadow-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15',
    formFieldLabel: 'text-[12px] font-medium text-fg-muted',
    formFieldLabelRow: 'mb-1.5',
    formFieldRow: 'mb-4',
    headerSubtitle: 'text-[13px] leading-relaxed text-fg-muted',
    headerTitle: 'font-display text-[28px] font-semibold tracking-tight text-fg',
    identityPreviewText: 'text-fg',
    modalBackdrop: 'bg-ink/30 backdrop-blur-sm',
    navbar: 'bg-bg-subtle',
    navbarButton: 'text-fg-muted hover:text-fg',
    popoverCard: 'border border-line bg-bg shadow-pop',
    socialButtonsBlockButton:
      'h-11 rounded-[10px] border border-[#D2D4D6] bg-[#F5F5F7] text-[13px] font-medium text-fg shadow-none hover:border-[#BFC3C7] hover:bg-[#ECEDEF]',
    userPreviewMainIdentifier: 'text-fg',
    userPreviewSecondaryIdentifier: 'text-fg-muted',
  },
} as const

export const clerkAuthPageAppearance = {
  ...clerkAppearance,
  variables: {
    ...clerkAppearance.variables,
    colorPrimary: '#2563eb',
  },
  elements: {
    ...clerkAppearance.elements,
    card: 'w-full border-0 bg-transparent shadow-none',
    cardBox: 'w-full shadow-none',
    footer: 'pt-5',
    footerAction: 'justify-center text-[11px] text-fg-muted',
    footerActionLink: 'font-semibold text-fg hover:text-[#ff5a13]',
    form: 'gap-3',
    formButtonPrimary:
      'h-11 rounded-[9px] bg-blue-600 text-[12px] font-semibold text-white shadow-none hover:bg-blue-700',
    formFieldInput:
      'h-11 rounded-[9px] border border-[#eeeeee] bg-white text-[12px] text-fg shadow-none placeholder:text-fg-faint focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10',
    formFieldLabel: 'text-left text-[11px] font-medium text-fg-muted',
    formFieldLabelRow: 'mb-1.5',
    formFieldRow: 'mb-3',
    formHeader: 'hidden',
    header: 'hidden',
    headerSubtitle: 'hidden',
    headerTitle: 'hidden',
    rootBox: 'mx-auto w-full max-w-[330px]',
    socialButtonsBlockButton:
      'h-10 rounded-[9px] border border-[#eeeeee] bg-white text-[12px] font-medium text-fg shadow-none hover:border-[#d8d8d8] hover:bg-[#fafafa]',
  },
} as const

export const clerkSignupPageAppearance = {
  ...clerkAuthPageAppearance,
  elements: {
    ...clerkAuthPageAppearance.elements,
  },
} as const

export const clerkSidebarUserButtonAppearance = {
  ...clerkAppearance,
  elements: {
    ...clerkAppearance.elements,
    rootBox: 'w-full',
    userButtonAvatarBox: 'size-6 rounded-full',
    userButtonBox: 'w-full',
    userButtonOuterIdentifier: 'min-w-0 flex-1 truncate text-left text-[12px] font-medium text-fg',
    userButtonPopoverActionButton: 'text-fg-muted hover:bg-bg-muted hover:text-fg',
    userButtonPopoverCard: 'border border-line bg-bg shadow-pop',
    userButtonPopoverFooter: 'hidden',
    userButtonTrigger:
      'flex h-9 w-full items-center justify-start gap-2 rounded-[5px] px-2 text-left transition hover:bg-bg-muted focus:shadow-ring-accent',
    userPreviewMainIdentifier: 'text-fg',
    userPreviewSecondaryIdentifier: 'text-fg-muted',
  },
} as const

export const clerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to LivoCall',
      subtitle: 'Continue to your voice agent workspace.',
    },
  },
  signUp: {
    start: {
      title: 'Create your LivoCall account',
      subtitle: 'Start your workspace for agents, campaigns, and call monitoring.',
    },
  },
} as const
