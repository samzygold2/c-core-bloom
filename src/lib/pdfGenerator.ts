import jsPDF from 'jspdf';

interface TestResult {
  studentName: string;
  email: string;
  testTitle: string;
  score: number;
  totalQuestions: number;
  startTime: string;
  endTime: string;
  answers: any;
}

export const generateTestResultPDF = (result: TestResult) => {
  const doc = new jsPDF();
  const percentage = ((result.score / result.totalQuestions) * 100).toFixed(1);
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header with student name prominently displayed
  doc.setFillColor(37, 99, 235); // Blue header
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  // Student Name - Large and prominent at top
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(result.studentName, pageWidth / 2, 20, { align: 'center' });
  
  // Email below name
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(result.email, pageWidth / 2, 30, { align: 'center' });
  
  // Test title
  doc.setFontSize(12);
  doc.text(`Test: ${result.testTitle}`, pageWidth / 2, 40, { align: 'center' });
  
  // Reset text color
  doc.setTextColor(0, 0, 0);
  
  // Score Section - Large centered display
  const scoreColor = parseFloat(percentage) >= 50 ? [34, 197, 94] : [239, 68, 68];
  const status = parseFloat(percentage) >= 50 ? 'PASSED' : 'FAILED';
  
  // Score circle background
  doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.circle(pageWidth / 2, 80, 25, 'F');
  
  // Score percentage
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`${percentage}%`, pageWidth / 2, 85, { align: 'center' });
  
  // Status badge
  doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.setFontSize(16);
  doc.text(status, pageWidth / 2, 115, { align: 'center' });
  
  // Score details
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${result.score} out of ${result.totalQuestions} questions correct`, pageWidth / 2, 125, { align: 'center' });
  
  // Divider line
  doc.setDrawColor(200, 200, 200);
  doc.line(20, 140, pageWidth - 20, 140);
  
  // Test Details Section
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Test Details', 20, 155);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  
  const startDate = new Date(result.startTime);
  const endDate = new Date(result.endTime);
  const duration = Math.round((endDate.getTime() - startDate.getTime()) / 1000 / 60);
  
  const details = [
    { label: 'Start Time:', value: startDate.toLocaleString() },
    { label: 'End Time:', value: endDate.toLocaleString() },
    { label: 'Duration:', value: `${duration} minutes` },
    { label: 'Total Questions:', value: result.totalQuestions.toString() },
    { label: 'Correct Answers:', value: result.score.toString() },
    { label: 'Incorrect Answers:', value: (result.totalQuestions - result.score).toString() },
  ];
  
  let yPos = 170;
  details.forEach(({ label, value }) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 25, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 80, yPos);
    yPos += 10;
  });
  
  // Footer
  doc.setTextColor(128, 128, 128);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, 270, { align: 'center' });
  doc.text('CBT Platform - Computer Based Testing System', pageWidth / 2, 278, { align: 'center' });
  
  // Border around page
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.rect(5, 5, pageWidth - 10, doc.internal.pageSize.getHeight() - 10);
  
  return doc;
};

export const downloadTestResultPDF = (result: TestResult) => {
  const doc = generateTestResultPDF(result);
  const fileName = `${result.studentName.replace(/\s+/g, '_')}_${result.testTitle.replace(/\s+/g, '_')}_Result.pdf`;
  doc.save(fileName);
};

export const getPDFBlob = (result: TestResult): Blob => {
  const doc = generateTestResultPDF(result);
  return doc.output('blob');
};