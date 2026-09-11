declare module "html2pdf.js" {
  type Html2PdfWorker = {
    set(opt: Record<string, unknown>): Html2PdfWorker;
    from(element: HTMLElement | string, type?: string): Html2PdfWorker;
    save(filename?: string): Promise<void>;
    outputPdf(type?: string): Promise<unknown>;
  };
  function html2pdf(): Html2PdfWorker;
  export default html2pdf;
}
