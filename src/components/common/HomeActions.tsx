"use client";

import { useState } from "react";
import { BookOpen, DoorOpen, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RulesDialog } from "@/components/game/RulesDialog";
import { CreateRoomDialog } from "@/components/lobby/CreateRoomDialog";
import { JoinRoomDialog } from "@/components/lobby/JoinRoomDialog";
import { ONLINE_ROOMS_ENABLED } from "@/lib/features";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function HomeActions() {
  const [dialog, setDialog] = useState<"create" | "join" | "rules" | null>(null);
  const configured = isSupabaseConfigured();
  const showOnline = ONLINE_ROOMS_ENABLED;
  const close = (open: boolean) => !open && setDialog(null);
  const cls = "h-11 rounded-xl px-4";
  return (
    <>
      <div className="flex flex-wrap justify-center gap-3">
        {showOnline && (
          <>
            <Button className={cls} disabled={!configured} onClick={() => setDialog("create")}>
              <PlusCircle /> Tạo phòng
            </Button>
            <Button variant="secondary" className={cls} disabled={!configured} onClick={() => setDialog("join")}>
              <DoorOpen /> Vào phòng
            </Button>
          </>
        )}
        <Button variant="secondary" className={cls} onClick={() => setDialog("rules")}>
          <BookOpen /> Luật chơi
        </Button>
      </div>
      {showOnline && !configured && (
        <p className="max-w-md text-xs text-muted-foreground">
          Chơi online cần cấu hình Supabase (xem README). Bạn vẫn có thể chơi cùng bạn trên một máy ở trên.
        </p>
      )}
      {showOnline && configured && (
        <>
          <CreateRoomDialog key={`c${dialog === "create"}`} open={dialog === "create"} onOpenChange={close} />
          <JoinRoomDialog open={dialog === "join"} onOpenChange={close} />
        </>
      )}
      <RulesDialog open={dialog === "rules"} onOpenChange={close} />
    </>
  );
}
