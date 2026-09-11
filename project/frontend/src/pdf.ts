import html2pdf from "html2pdf.js";

export const PDF_CONTAINER_ID = "technical-specification";
const PRINT_CLASS = "tz-printing";
const STYLE_ID = "__tz_pdf_style";

export function tzPdfFilename(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? `${clean}-ТЗ.pdf` : "technical-specification.pdf";
}

/**
 * Print-слой ТЗ. Навешивается класс на <html>, поэтому живёт в одном <style>
 * и гарантированно попадает в клон html2canvas. Все цвета — литеральные,
 * т.к. html2canvas не резолвит CSS-переменные, а layout разворачиваем в блок,
 * чтобы убрать overflow/flex/grid в пользу чистой A4-вёрстки.
 */
const PDF_CSS = `
html.${PRINT_CLASS} #technical-specification,
html.${PRINT_CLASS} #technical-specification *,
html.${PRINT_CLASS} #technical-specification *::before,
html.${PRINT_CLASS} #technical-specification *::after { box-sizing: border-box; }

/* ---- сбрасываем ancestors, чтобы контент вышел целиком (без скролла/обрезки) ---- */
html.${PRINT_CLASS}, html.${PRINT_CLASS} body, html.${PRINT_CLASS} #root {
  height: auto !important; max-height: none !important; overflow: visible !important;
  background: #ffffff !important;
}
html.${PRINT_CLASS} .app-ui {
  height: auto !important; min-height: 0 !important; overflow: visible !important;
  display: block !important; background: #ffffff !important; color: #1a1a1a !important;
}
html.${PRINT_CLASS} .doc-layout { display: block !important; height: auto !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; }
html.${PRINT_CLASS} .topbar, html.${PRINT_CLASS} .appfoot, html.${PRINT_CLASS} .doc-nav,
html.${PRINT_CLASS} .background-art, html.${PRINT_CLASS} .pdf-exclude,
html.${PRINT_CLASS} button, html.${PRINT_CLASS} #technical-specification .crumb a,
html.${PRINT_CLASS} .link-btn { display: none !important; }
html.${PRINT_CLASS} .doc, html.${PRINT_CLASS} .doc-main, html.${PRINT_CLASS} #technical-specification {
  display: block !important; width: 190mm !important; max-width: none !important;
  height: auto !important; max-height: none !important; overflow: visible !important;
  padding: 0 !important; margin: 0 !important; background: #ffffff !important; color: #1a1a1a !important;
}
html.${PRINT_CLASS} .doc-in { display: block !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }

/* ---- типографика документа ---- */
html.${PRINT_CLASS} #technical-specification {
  font-family: Arial, Helvetica, sans-serif !important; font-size: 11pt !important; line-height: 1.5 !important;
}
html.${PRINT_CLASS} .doc-head { padding: 0 0 6mm 0 !important; margin: 0 0 8mm 0 !important; border-bottom: 1.5px solid #d0d0d0 !important; }
html.${PRINT_CLASS} .doc-head .crumb { display: block !important; font-size: 8.5pt !important; color: #8a8a8a !important; text-transform: uppercase; letter-spacing: .5px; margin: 0 0 3mm 0 !important; font-weight: 700; }
html.${PRINT_CLASS} .doc-head h1 { font-size: 22pt !important; line-height: 1.15 !important; margin: 0 0 3mm 0 !important; font-weight: 700 !important; color: #111111 !important; }
html.${PRINT_CLASS} .doc-sub { font-size: 11pt !important; color: #555555 !important; margin: 0 !important; line-height: 1.5 !important; }

html.${PRINT_CLASS} .stat-chips { display: block !important; margin: 6mm 0 0 0 !important; }
html.${PRINT_CLASS} .stat-chip { display: inline-block !important; background: #f1f1f1 !important; box-shadow: none !important; color: #444444 !important; border-radius: 3mm !important; padding: 2mm 3.5mm !important; height: auto !important; font-size: 9.5pt !important; margin: 0 2mm 2mm 0 !important; }
html.${PRINT_CLASS} .stat-chip b { color: #111111 !important; font-size: 11pt !important; }
html.${PRINT_CLASS} .stat-chip.problem b { color: #b31618 !important; }

html.${PRINT_CLASS} section { display: block !important; }
html.${PRINT_CLASS} .doc-sec { font-size: 11pt !important; color: #b31618 !important; text-transform: uppercase; letter-spacing: 1px; font-weight: 700 !important; margin: 8mm 0 !important; padding: 0 0 2mm 0 !important; border-bottom: 1px solid #e2e2e2 !important; page-break-after: avoid !important; break-after: avoid !important; }
html.${PRINT_CLASS} .doc-lead { background: #f7f7f7 !important; box-shadow: none !important; border-left: 3px solid #b31618 !important; color: #333333 !important; border-radius: 0 !important; padding: 4mm 5mm !important; font-size: 11pt !important; line-height: 1.6 !important; margin: 0 0 4mm 0 !important; }

html.${PRINT_CLASS} .doc-req {
  background: #ffffff !important; border: 1px solid #d9d9d9 !important; border-radius: 2.5mm !important;
  padding: 4.5mm 5mm !important; margin: 0 0 4mm 0 !important;
  page-break-inside: avoid !important; break-inside: avoid !important;
}
html.${PRINT_CLASS} .doc-req .hd { display: block !important; margin: 0 0 2.5mm 0 !important; }
html.${PRINT_CLASS} .doc-req .hd svg, html.${PRINT_CLASS} .foot svg, html.${PRINT_CLASS} .note svg { display: none !important; }
html.${PRINT_CLASS} .doc-req .code { display: inline-block !important; background: #fbeaea !important; color: #b31618 !important; height: auto !important; min-width: 0 !important; border-radius: 2mm !important; padding: .6mm 2.2mm !important; font-size: 9.5pt !important; font-weight: 700 !important; margin-right: 2mm !important; vertical-align: middle; }
html.${PRINT_CLASS} .doc-req .tt { display: inline !important; font-size: 12pt !important; font-weight: 700 !important; color: #111111 !important; min-width: 0 !important; flex: none !important; vertical-align: middle; }
html.${PRINT_CLASS} .badge { display: inline-block !important; vertical-align: middle; height: auto !important; padding: .6mm 2.4mm !important; border-radius: 2mm !important; font-size: 8pt !important; font-weight: 700 !important; letter-spacing: .4px; text-transform: uppercase; background: #ededed !important; color: #555555 !important; }
html.${PRINT_CLASS} .badge.high, html.${PRINT_CLASS} .badge.critical { background: #b31618 !important; color: #ffffff !important; }
html.${PRINT_CLASS} .badge.medium { background: #f2d9a8 !important; color: #7a5200 !important; }
html.${PRINT_CLASS} .badge.low { background: #d4efdd !important; color: #1c7a3e !important; }
html.${PRINT_CLASS} .badge.red-soft { background: #fbeaea !important; color: #b31618 !important; }
html.${PRINT_CLASS} .doc-sec .badge { display: none !important; }
html.${PRINT_CLASS} .doc-req p { font-size: 11pt !important; line-height: 1.55 !important; color: #333333 !important; margin: 0 0 3mm 0 !important; }

html.${PRINT_CLASS} .doc-req .foot { display: block !important; margin-top: 3mm !important; padding-top: 2.5mm !important; border-top: 1px dashed #e0e0e0 !important; font-size: 9.5pt !important; color: #666666 !important; }
html.${PRINT_CLASS} .doc-req .foot span { display: inline-block !important; margin: 0 4mm 1mm 0 !important; }
html.${PRINT_CLASS} .doc-req .foot b { color: #222222 !important; font-weight: 700 !important; }

html.${PRINT_CLASS} .note { display: block !important; background: #f6f6f6 !important; color: #444444 !important; border-radius: 2mm !important; padding: 3mm 4mm !important; font-size: 10pt !important; line-height: 1.5 !important; margin: 2.5mm 0 0 0 !important; box-shadow: none !important; border-left: 2px solid #cccccc !important; page-break-inside: avoid !important; break-inside: avoid !important; }
html.${PRINT_CLASS} .note span, html.${PRINT_CLASS} .note b { display: inline !important; }
html.${PRINT_CLASS} .note.good { background: #f0f8f2 !important; color: #1c7a3e !important; border-left-color: #1c7a3e !important; }
html.${PRINT_CLASS} .note.warn { background: #fdf0f0 !important; color: #b31618 !important; border-left-color: #b31618 !important; }

html.${PRINT_CLASS} .role-card { display: inline-block !important; background: #f1f1f1 !important; border: 1px solid #dcdcdc !important; border-radius: 20px !important; padding: 1.8mm 4mm !important; margin: 0 2mm 2mm 0 !important; font-size: 10.5pt !important; font-weight: 700 !important; color: #222222 !important; }
html.${PRINT_CLASS} .role-card .n { display: inline-block !important; background: #fbeaea !important; color: #b31618 !important; border-radius: 9px !important; padding: .3mm 2.2mm !important; font-size: 9pt !important; margin-left: 1mm !important; }

html.${PRINT_CLASS} .vs-row { display: grid !important; grid-template-columns: 1fr auto 1fr !important; gap: 4mm !important; align-items: stretch !important; margin: 4mm 0 !important; page-break-inside: avoid !important; break-inside: avoid !important; }
html.${PRINT_CLASS} .vs-box { background: #f6f6f6 !important; border: 1px solid #dcdcdc !important; border-radius: 2mm !important; padding: 3mm !important; font-size: 10pt !important; line-height: 1.45 !important; color: #333333 !important; }
html.${PRINT_CLASS} .vs { display: flex !important; align-items: center !important; font-size: 8.5pt !important; font-weight: 800 !important; letter-spacing: .5px; color: #b31618 !important; text-transform: uppercase; }
html.${PRINT_CLASS} .src-link { display: block !important; font-size: 8.5pt !important; color: #b31618 !important; font-weight: 700 !important; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 1.5mm !important; }
`;

/**
 * Скачивает PDF ТЗ. Вместо сырого снимка интерфейса (ломается на var(),
 * flex/grid, backdrop-filter и тенях) живой документ на время экспорта
 * переводится в print-режим: структура остаётся 1:1, но вёрстка становится
 * A4 с типографикой, литеральными цветами и нормальными переносами страниц.
 */
export async function downloadTzPdf(filename: string): Promise<void> {
  const element = document.getElementById(PDF_CONTAINER_ID);
  if (!element) {
    console.error(`Не найден контейнер технического задания #${PDF_CONTAINER_ID}`);
    throw new Error("container-missing");
  }

  const root = document.documentElement;
  const prevScroll = window.scrollY;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = PDF_CSS;
  document.head.appendChild(style);
  root.classList.add(PRINT_CLASS);
  root.setAttribute("data-theme", "light");
  window.scrollTo(0, 0);

  try {
    await html2pdf()
      .set({
        margin: [12, 10, 12, 10],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: 794, // ≈ 210mm при 96dpi — стабильный пересчёт mm↔px
          logging: false,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
        pagebreak: {
          mode: ["css", "legacy"],
          avoid: [".doc-req", ".note", ".role-card", ".vs-row", ".doc-sec", "h1", "h2"],
        },
      })
      .from(element)
      .save();
  } finally {
    root.classList.remove(PRINT_CLASS);
    document.getElementById(STYLE_ID)?.remove();
    window.scrollTo(0, prevScroll);
  }
}
