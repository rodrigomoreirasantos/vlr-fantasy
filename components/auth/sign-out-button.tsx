"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    await signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isLoading}
      onClick={handleClick}
    >
      {isLoading ? "Saindo…" : "Sair"}
    </Button>
  );
}
