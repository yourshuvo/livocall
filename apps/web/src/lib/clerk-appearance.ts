export const clerkAppearance = {
  variables: {
    borderRadius: '6px',
    colorBackground: '#ffffff',
    colorDanger: '#ef4444',
    colorInputBackground: '#fafaf9',
    colorInputText: '#0a0a0a',
    colorPrimary: '#0a0a0a',
    colorText: '#0a0a0a',
    colorTextSecondary: '#525252',
    fontFamily: 'var(--font-sans)',
  },
  elements: {
    avatarBox: 'rounded-full',
    card: 'border border-line bg-bg shadow-card',
    cardBox: 'shadow-none',
    footerActionLink: 'font-medium text-fg hover:text-fg-strong',
    formButtonPrimary: 'bg-blue-600 text-white shadow-none hover:bg-blue-700',
    formFieldInput:
      'rounded border border-line bg-bg-subtle text-fg focus:border-fg/40 focus:ring-2 focus:ring-accent/20',
    formFieldLabel: 'text-fg-muted',
    headerSubtitle: 'text-fg-muted',
    headerTitle: 'text-fg',
    identityPreviewText: 'text-fg',
    modalBackdrop: 'bg-ink/30 backdrop-blur-sm',
    navbar: 'bg-bg-subtle',
    navbarButton: 'text-fg-muted hover:text-fg',
    popoverCard: 'border border-line bg-bg shadow-pop',
    socialButtonsBlockButton:
      'border border-line bg-bg-subtle text-fg shadow-none hover:bg-bg-muted hover:border-line-strong',
    userPreviewMainIdentifier: 'text-fg',
    userPreviewSecondaryIdentifier: 'text-fg-muted',
  },
} as const

export const clerkAuthPageAppearance = {
  ...clerkAppearance,
  elements: {
    ...clerkAppearance.elements,
    card: 'w-full border border-line bg-bg shadow-card',
    cardBox: 'w-full shadow-none',
    rootBox: 'mx-auto w-full max-w-[420px]',
  },
} as const

export const clerkSignupPageAppearance = {
  ...clerkAuthPageAppearance,
  elements: {
    ...clerkAuthPageAppearance.elements,
    footer: 'hidden',
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
