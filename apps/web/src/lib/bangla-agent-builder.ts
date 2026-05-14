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

export interface GeneratedAgentPrompt {
  name: string
  description: string
  language: AgentLanguage
  system: string
  firstMessage: string
  guardrails: string
}

export const EMPTY_AGENT_BUILDER: AgentBuilderAnswers = {
  businessName: '',
  agentName: '',
  industry: '',
  callGoal: '',
  customerType: '',
  languageStyle: 'সহজ, ভদ্র, বাংলাদেশি কথ্য বাংলা; দরকার হলে ছোট English শব্দ ব্যবহার করবে',
  keyQuestions: '',
  kbRules: 'প্রোডাক্ট, দাম, পলিসি বা প্রসেস সম্পর্কিত প্রশ্নের উত্তর Knowledge Base থেকে দেবে। না জানলে বানিয়ে বলবে না।',
  toolRules: 'দরকার হলে সংযুক্ত tools/function ব্যবহার করবে এবং ফলাফল এক বাক্যে বুঝিয়ে বলবে।',
  transferRules: 'কাস্টমার মানুষ/ম্যানেজার চাইলে বা উত্তর নিশ্চিত না হলে human agent-এ transfer করবে।',
  complianceRules: 'OTP, bKash PIN, কার্ড নম্বর বা পাসওয়ার্ড চাইবে না। কল রেকর্ড হলে শুরুতে জানাবে।',
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
  }
}
