"use client";

import { Button } from "@/components/ui/button";
import { IconPage } from "@/components/ui/icons";

export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()} className="self-start sm:self-auto">
      <IconPage />
      Print
    </Button>
  );
}
