"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function RulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Luật chơi Ô Ăn Quan</DialogTitle>
          <DialogDescription>Luật đầy đủ nằm trong docs/RULES.md.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed">
          <section>
            <h3 className="font-semibold">Bàn cờ</h3>
            <p>
              Các ô nối thành một vòng. Mỗi người có 5 ô dân (5 dân mỗi ô) và một ô quan (1 quan = 10 điểm, 1 dân = 1
              điểm). 2 người: bàn chữ nhật; 3 người: tam giác; 4 người: hình vuông.
            </p>
          </section>
          <section>
            <h3 className="font-semibold">Lượt đi</h3>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Chọn một ô dân của mình còn dân và chọn hướng rải.</li>
              <li>Bốc hết dân, rải mỗi ô một quân theo hướng đã chọn.</li>
              <li>Ô kế tiếp có dân: bốc lên rải tiếp.</li>
              <li>Ô kế tiếp là ô quan còn quân: mất lượt.</li>
              <li>Ô kế tiếp trống, ô sau nó có quân: ăn hết. Ăn liên tiếp nếu lại có ô trống rồi ô có quân.</li>
              <li>Hai ô trống liền nhau: mất lượt.</li>
            </ol>
          </section>
          <section>
            <h3 className="font-semibold">Hết quân và kết thúc</h3>
            <p>
              Đến lượt mà 5 ô của bạn trống, bạn phải mượn 5 dân đã ăn để rải mỗi ô một dân. Không đủ 5 dân thì bị loại.
              Ván kết thúc khi mọi quan bị ăn hoặc chỉ còn một người chưa bị loại; dân còn trên bàn về chủ ô. Điểm cao
              nhất thắng, bằng điểm là hòa.
            </p>
          </section>
          <section>
            <h3 className="font-semibold">Biến thể 3 và 4 người</h3>
            <p>
              Luật rải và ăn giữ nguyên trên vòng dài hơn. Lượt đi theo thứ tự ghế, bỏ qua người bị loại; có thể ăn ở
              mọi ô; người đầu hàng bị loại và không thể thắng.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
