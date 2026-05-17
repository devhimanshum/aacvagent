// CV text extraction — PDF, DOCX, DOC, XLS, XLSX
// Runs server-side only (Node.js)

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (err) {
    console.error('PDF parse error:', err);
    throw new Error('Failed to extract text from PDF');
  }
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (err) {
    console.error('DOCX parse error:', err);
    throw new Error('Failed to extract text from DOCX');
  }
}

export async function extractTextFromXLS(buffer: Buffer): Promise<string> {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const lines: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv.trim()) lines.push(csv);
    }
    return lines.join('\n\n');
  } catch (err) {
    console.error('XLS/XLSX parse error:', err);
    throw new Error('Failed to extract text from spreadsheet');
  }
}

export async function extractCVText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const n = fileName.toLowerCase();

  if (mimeType === 'application/pdf' || n.endsWith('.pdf')) {
    return extractTextFromPDF(buffer);
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    n.endsWith('.docx') ||
    n.endsWith('.doc')
  ) {
    return extractTextFromDOCX(buffer);
  }

  if (
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    n.endsWith('.xls') ||
    n.endsWith('.xlsx')
  ) {
    return extractTextFromXLS(buffer);
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}

export function isSupportedCVFile(mimeType: string, fileName: string): boolean {
  const n = fileName.toLowerCase();
  const supportedMimes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  return (
    supportedMimes.includes(mimeType) ||
    n.endsWith('.pdf') ||
    n.endsWith('.docx') ||
    n.endsWith('.doc') ||
    n.endsWith('.xls') ||
    n.endsWith('.xlsx')
  );
}
