"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/login/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        title="Sair"
        className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </form>
  );
}
