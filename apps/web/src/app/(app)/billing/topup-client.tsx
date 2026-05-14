'use client'
import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icon } from '@/components/ui/icon'
import { api } from '@/lib/api-fetch'
import { useToast } from '@/components/ui/toast'

interface PayStationTopupResp {
  provider: 'paystation'
  invoiceNumber: string
  redirectUrl: string
  amountPaisa: number
}

export function TopupButton({ canAdmin, defaultAmountTaka = 500 }: { canAdmin: boolean; defaultAmountTaka?: number }) {
  const [open, setOpen] = useState(false)
  const [amountTaka, setAmountTaka] = useState<number>(defaultAmountTaka)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [pending, start] = useTransition()
  const { toast } = useToast()

  function submit() {
    if (amountTaka < 10) {
      toast('Minimum top-up is ৳10', 'error')
      return
    }
    if (!customerPhone.trim()) {
      toast('Customer phone is required for PayStation', 'error')
      return
    }
    start(async () => {
      try {
        const r = await api.post<PayStationTopupResp>('/api/billing/topup', {
          amountPaisa: Math.round(amountTaka * 100),
          customerName: customerName || undefined,
          customerPhone,
          customerAddress: customerAddress || undefined,
        })
        window.location.href = r.redirectUrl
      } catch (e) {
        toast((e as Error).message, 'error')
      }
    })
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)} disabled={!canAdmin}>
        <Icon name="plus" size="sm" />
        Top up
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top up workspace</DialogTitle>
            <p className="text-[12.5px] text-fg-muted">
              PayStation will open a hosted checkout page. This uses the live PayStation environment.
            </p>
          </DialogHeader>

          <div className="grid gap-3">
            <div>
              <Label>Amount (BDT)</Label>
              <Input
                className="mt-2"
                type="number"
                min={10}
                step={10}
                value={amountTaka}
                onChange={(e) => setAmountTaka(Number(e.target.value))}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[500, 1_000, 5_000, 25_000, 50_000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={
                      'rounded-full border px-2 py-0.5 font-mono text-[11px] ' +
                      (amountTaka === v
                        ? 'border-fg/40 bg-fg/5 text-fg'
                        : 'border-line text-fg-muted hover:border-fg/30')
                    }
                    onClick={() => setAmountTaka(v)}
                  >
                    ৳{v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Customer name</Label>
                <Input
                  className="mt-2"
                  placeholder="Full name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <Label>Customer phone</Label>
                <Input
                  className="mt-2"
                  placeholder="017XXXXXXXX"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>Address (optional)</Label>
              <Input
                className="mt-2"
                placeholder="Customer address"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button size="sm" onClick={submit} disabled={pending || !canAdmin}>
              Continue to PayStation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
