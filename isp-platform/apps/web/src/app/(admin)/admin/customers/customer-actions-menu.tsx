"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function CustomerActionsMenu({ customerId }: { customerId: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="inline-block size-8" aria-hidden="true" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Customer actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={`/admin/customers/${customerId}`} />}>View details</DropdownMenuItem>
        <DropdownMenuItem render={<Link href={`/admin/customers/${customerId}`} />}>Edit customer</DropdownMenuItem>
        <DropdownMenuItem render={<Link href={`/admin/customers/${customerId}`} />}>View billing history</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}