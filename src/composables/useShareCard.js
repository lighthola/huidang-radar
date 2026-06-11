import { ref } from 'vue';
import { toBlob } from 'html-to-image';

// YY-MM-DD HH:mm（截圖當下）
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getFullYear() % 100)}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function useShareCard() {
  // 每個元件實例各持一份 sharing（非模組單例）：避免多列同時展開時，
  // 分享一列讓其他列的分享鈕也一起變「處理中…」；同一顆鈕防連點仍由下方守衛處理
  const sharing = ref(false);

  /**
   * 把展開的個股卡片（.row-face 節點）渲染成 PNG 並分享 / 下載。
   * 採離屏 clone：即時畫面完全不動，圖片裡才會出現來源列、且不含分享按鈕本身。
   */
  async function shareRow(faceEl, code) {
    if (!faceEl || sharing.value) return;
    sharing.value = true;

    let holder = null;
    try {
      const rect = faceEl.getBoundingClientRect();
      const clone = faceEl.cloneNode(true);
      clone.style.transform = 'none';
      clone.style.width = `${rect.width}px`;
      clone.style.borderBottom = 'none';
      // 停用 clone 內所有動畫：插入 DOM 會重播 .row-detail 的 detailin 淡入（opacity:0 起手），
      // html-to-image 會在淡入過程中截到空白的展開區
      clone.querySelectorAll('*').forEach((el) => { el.style.animation = 'none'; });

      // 移除分享按鈕本身（不入圖），改在原位置顯示來源列（app 名稱 + 時間）
      clone.querySelector('[data-share-btn]')?.remove();
      const credit = clone.querySelector('[data-share-credit]');
      if (credit) {
        credit.style.display = 'flex';
        const t = credit.querySelector('[data-share-time]');
        if (t) t.textContent = `(${stamp()})`;
      }

      holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;pointer-events:none;';
      holder.appendChild(clone);
      document.body.appendChild(holder);

      const blob = await toBlob(clone, {
        pixelRatio: 2,
        backgroundColor: '#060708',
        // app 已改用系統字堆疊（無 web font），系統字本就存在於 SVG 算繪環境、
        // 不需嵌入；skipFonts 跳過字型嵌入步驟，圖片與 app 用同一套系統字、天生一致。
        skipFonts: true,
      });
      if (!blob) throw new Error('toBlob returned null');

      const file = new File([blob], `回檔雷達-${code}.png`, { type: 'image/png' });

      // 純圖片分享（不帶 title/text）；不支援時退回下載
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      // 使用者在系統分享單按取消 → AbortError，靜默忽略
      if (err && err.name !== 'AbortError') {
        console.error('[shareRow] 分享失敗', err);
      }
    } finally {
      if (holder) holder.remove();
      sharing.value = false;
    }
  }

  return { sharing, shareRow };
}
