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
  
  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('CBT Test Results', 105, 20, { align: 'center' });
  
  // Test Info
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Test: ${result.testTitle}`, 20, 40);
  
  // Student Info
  doc.setFontSize(11);
  doc.text(`Student: ${result.studentName}`, 20, 55);
  doc.text(`Email: ${result.email}`, 20, 65);
  
  // Test Details
  doc.text(`Start Time: ${new Date(result.startTime).toLocaleString()}`, 20, 80);
  doc.text(`End Time: ${new Date(result.endTime).toLocaleString()}`, 20, 90);
  
  // Duration calculation
  const duration = Math.round((new Date(result.endTime).getTime() - new Date(result.startTime).getTime()) / 1000 / 60);
  doc.text(`Duration: ${duration} minutes`, 20, 100);
  
  // Score Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Score', 20, 120);
  
  doc.setFontSize(24);
  const scoreColor = parseFloat(percentage) >= 50 ? [34, 197, 94] : [239, 68, 68];
  doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.text(`${percentage}%`, 20, 135);
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${result.score} / ${result.totalQuestions} correct answers`, 20, 145);
  
  // Result Status
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  const status = parseFloat(percentage) >= 50 ? 'PASSED' : 'FAILED';
  doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.text(status, 20, 160);
  
  // Footer
  doc.setTextColor(128, 128, 128);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated on ${new Date().toLocaleString()}`, 105, 280, { align: 'center' });
  doc.text('CBT Platform - Computer Based Testing System', 105, 287, { align: 'center' });
  
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