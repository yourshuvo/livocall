import { redirect } from 'next/navigation'

export default function EditAgentPage({ params }: { params: { id: string } }) {
  redirect(`/agents/${params.id}`)
}
