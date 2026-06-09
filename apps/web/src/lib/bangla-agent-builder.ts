import type { AgentLanguage } from '@/types/agent'

export interface AgentBuilderAnswers {
  businessName: string
  agentName: string
  industry: string
  callGoal: string
  customerType: string
  languageStyle: string
  keyQuestions: string
  kbRules: string
  toolRules: string
  transferRules: string
  complianceRules: string
}

export interface GeneratedOutcomeLabel {
  key: string
  label: string
  description: string
  conversion: boolean
}

export interface GeneratedOutcomeConfig {
  enabled: boolean
  labels: GeneratedOutcomeLabel[]
}

export interface GeneratedAgentPrompt {
  name: string
  description: string
  language: AgentLanguage
  system: string
  firstMessage: string
  guardrails: string
  outcomeConfig: GeneratedOutcomeConfig
}

export const EMPTY_AGENT_BUILDER: AgentBuilderAnswers = {
  businessName: '',
  agentName: '',
  industry: '',
  callGoal: '',
  customerType: '',
  languageStyle: 'সহজ, ভদ্র, বাংলাদেশি কথ্য বাংলা; দরকার হলে ছোট English শব্দ ব্যবহার করবে',
  keyQuestions: '',
  kbRules:
    'প্রোডাক্ট, দাম, পলিসি বা প্রসেস সম্পর্কিত প্রশ্নের উত্তর Knowledge Base থেকে দেবে। না জানলে বানিয়ে বলবে না।',
  toolRules: 'দরকার হলে সংযুক্ত tools/function ব্যবহার করবে এবং ফলাফল এক বাক্যে বুঝিয়ে বলবে।',
  transferRules:
    'কাস্টমার মানুষ/ম্যানেজার চাইলে বা উত্তর নিশ্চিত না হলে human agent-এ transfer করবে।',
  complianceRules:
    'OTP, bKash PIN, কার্ড নম্বর বা পাসওয়ার্ড চাইবে না। কল রেকর্ড হলে শুরুতে জানাবে।',
}

const DEFAULT_REVENUE_OUTCOME_LABELS: GeneratedOutcomeLabel[] = [
  {
    key: 'interested',
    label: 'Interested',
    description: 'Caller showed buying intent or asked for next steps.',
    conversion: true,
  },
  {
    key: 'not_interested',
    label: 'Not interested',
    description: 'Caller declined the offer or asked not to proceed.',
    conversion: false,
  },
  {
    key: 'callback_requested',
    label: 'Callback requested',
    description: 'Caller asked to be contacted later.',
    conversion: false,
  },
  {
    key: 'purchased',
    label: 'Purchased',
    description: 'Caller confirmed an order, payment, booking, or purchase.',
    conversion: true,
  },
  {
    key: 'complaint',
    label: 'Complaint',
    description: 'Caller raised a complaint, escalation, refund, or service issue.',
    conversion: false,
  },
  {
    key: 'wrong_number',
    label: 'Wrong number',
    description: 'Caller said this is the wrong person or number.',
    conversion: false,
  },
  {
    key: 'unknown',
    label: 'Unknown',
    description: 'Outcome cannot be confidently determined.',
    conversion: false,
  },
]

export function buildRevenueOutcomeConfig(a: AgentBuilderAnswers): GeneratedOutcomeConfig {
  const autoLabel = inferPrimaryRevenueOutcome(a)
  const deduped = new Map<string, GeneratedOutcomeLabel>()
  for (const label of [autoLabel, ...DEFAULT_REVENUE_OUTCOME_LABELS]) {
    if (!deduped.has(label.key)) deduped.set(label.key, label)
  }
  return {
    enabled: true,
    labels: [...deduped.values()].slice(0, 12),
  }
}

function inferPrimaryRevenueOutcome(a: AgentBuilderAnswers): GeneratedOutcomeLabel {
  const text = `${a.industry} ${a.callGoal} ${a.keyQuestions}`.toLowerCase()
  if (/\b(order|purchase|payment|checkout|cod|delivery|sell|sales|buy|cart)\b/.test(text)) {
    return {
      key: 'order_confirmed',
      label: 'Order confirmed',
      description: 'Caller confirmed an order, payment, delivery, or COD details.',
      conversion: true,
    }
  }
  if (/\b(book|booking|appointments?|reservations?|schedule|slot)\b/.test(text)) {
    return {
      key: 'booking_confirmed',
      label: 'Booking confirmed',
      description: 'Caller confirmed a booking, appointment, reservation, or time slot.',
      conversion: true,
    }
  }
  if (/\b(lead|quote|demo|trial|interested|pricing|proposal)\b/.test(text)) {
    return {
      key: 'qualified_lead',
      label: 'Qualified lead',
      description: 'Caller gave enough buying intent or details for sales follow-up.',
      conversion: true,
    }
  }
  if (/\b(support|complaint|refund|issue|problem|ticket|case)\b/.test(text)) {
    return {
      key: 'issue_resolved',
      label: 'Issue resolved',
      description: 'Caller issue was resolved or enough details were collected for follow-up.',
      conversion: false,
    }
  }
  return {
    key: 'goal_completed',
    label: 'Goal completed',
    description: 'Caller completed the main goal described for this agent.',
    conversion: true,
  }
}

export function buildBanglaAgentPrompt(a: AgentBuilderAnswers): GeneratedAgentPrompt {
  const business = a.businessName || '[Business]'
  const agent = a.agentName || 'সহকারী'
  const goal = a.callGoal || 'কাস্টমারকে দ্রুত ও ভদ্রভাবে সাহায্য করা'
  const customer = a.customerType || 'বাংলাদেশি কাস্টমার'
  const industry = a.industry || 'সার্ভিস'
  const questions = a.keyQuestions || 'কাস্টমারের প্রয়োজন বুঝে একটি করে প্রশ্ন করবে'
  const system = `## পরিচয়
তুমি ${business}-এর ${agent}। তুমি ফোন কলে ${customer}-দের সাথে কথা বলবে। ব্যবসার ধরন: ${industry}।

## মূল লক্ষ্য
${goal}

## ভাষা ও টোন
${a.languageStyle || EMPTY_AGENT_BUILDER.languageStyle}।
খুব দ্রুত উত্তর দেবে, বেশিরভাগ উত্তর এক ছোট বাক্যে রাখবে, এবং একবারে একটাই প্রশ্ন করবে।

## কথোপকথনের নিয়ম
- শুরুতে নিজের পরিচয় দেবে এবং কেন কল করা হয়েছে বলবে।
- কাস্টমার কথা শেষ করলে সাথে সাথে উত্তর দেবে।
- অপ্রয়োজনীয় ব্যাখ্যা দেবে না।
- কাস্টমার রাগ করলে শান্ত থাকবে, ক্ষমা চাইবে, তারপর সমাধানের পরের ধাপ বলবে।
- প্রয়োজনীয় প্রশ্ন: ${questions}

## Knowledge Base নিয়ম
${a.kbRules || EMPTY_AGENT_BUILDER.kbRules}

## Tool / Function নিয়ম
${a.toolRules || EMPTY_AGENT_BUILDER.toolRules}

## Transfer নিয়ম
${a.transferRules || EMPTY_AGENT_BUILDER.transferRules}

## Compliance / নিরাপত্তা
${a.complianceRules || EMPTY_AGENT_BUILDER.complianceRules}`

  const firstMessage = `আসসালামু আলাইকুম, আমি ${business}-এর ${agent} বলছি। ${goal}—আমি কি এখন কথা বলতে পারি?`
  const guardrails = `${a.complianceRules || EMPTY_AGENT_BUILDER.complianceRules}
ভুল তথ্য নিশ্চিতভাবে বলবে না। Knowledge Base বা tool result না থাকলে বলবে: “আমি বিষয়টা চেক করে জানাচ্ছি।”`
  return {
    name: `${agent} · ${business}`.slice(0, 120),
    description: `${industry} agent: ${goal}`.slice(0, 400),
    language: 'bn-en-mixed',
    system,
    firstMessage,
    guardrails,
    outcomeConfig: buildRevenueOutcomeConfig(a),
  }
}
