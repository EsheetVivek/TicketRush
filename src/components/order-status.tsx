"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While payment is being confirmed, refresh the page every 2 s until tickets are issued or refunded. */
export function OrderStatusPoller({ orderId, done }: { orderId: string; done: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (done) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/orders/${orderId}`);
      if (r.ok) {
        const { status } = await r.json();
        if (status !== "pending" && status !== "paid") router.refresh();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [orderId, done, router]);
  return null;
}
