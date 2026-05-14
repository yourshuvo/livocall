const TESTIMONIALS = [
  {
    quote: 'LivoCall helped us confirm orders before dispatch and reduce failed COD deliveries.',
    name: 'Operations lead',
    company: 'Dhaka commerce team',
  },
  {
    quote: 'The value is simple: customers get a fast call, and our team only handles escalations.',
    name: 'Founder',
    company: 'Service marketplace',
  },
]

export function Testimonials() {
  return (
    <section className="grid gap-3 md:grid-cols-2">
      {TESTIMONIALS.map((item) => (
        <figure key={item.quote} className="rounded-xl border border-line bg-bg p-5">
          <blockquote className="text-[15px] leading-6 text-fg">“{item.quote}”</blockquote>
          <figcaption className="mt-4 text-[12px] text-fg-muted">
            {item.name} · {item.company}
          </figcaption>
        </figure>
      ))}
    </section>
  )
}